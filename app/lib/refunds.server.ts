import { data } from "react-router";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "~/db";
import { formatPrice } from "~/lib/utils";
import { getLessonIdsForCourse } from "~/lib/progress.server";
import {
  coupons,
  courses,
  DeclineReason,
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  videoWatchEvents,
  LessonProgressStatus,
  refunds,
  users,
  RefundState,
  RefundStatus,
  UserRole,
} from "~/db/schema";

// ─── Refund Requests and Refunds ───
// Vocabulary follows GLOSSARY.md. A Reviewer (Admin, or the Instructor who owns
// the course) decides Refund Requests; only Admins carry out the Refund.
// Every function takes the database so tests can pass an in-memory one.

/** A learner who has watched this much of a course can't raise a Refund Request. */
export const REFUND_WATCH_CAP_SECONDS = 2 * 60 * 60;

export type Actor = { id: number; role: UserRole };

export type RefundRequestFilter = "open" | "approved" | "declined";

const FILTER_STATUS: Record<RefundRequestFilter, RefundStatus> = {
  open: RefundStatus.Open,
  approved: RefundStatus.Approved,
  declined: RefundStatus.Declined,
};

/** The preset reasons a Reviewer can pick, as the learner reads them. */
export const DECLINE_REASON_LABELS: Record<
  Exclude<DeclineReason, DeclineReason.Other>,
  string
> = {
  [DeclineReason.TooMuchCompleted]: "Too much of the course already completed",
  [DeclineReason.MatchesDescription]: "Course matches its description",
  [DeclineReason.Duplicate]: "Duplicate or repeated request",
};

/** What a learner reads as the reason their request was declined. */
function declineReasonLabel(
  reason: DeclineReason | null,
  text: string | null
): string | null {
  if (!reason) return null;
  if (reason === DeclineReason.Other) return text;
  return DECLINE_REASON_LABELS[reason];
}

export const declineInputSchema = z
  .object({
    declineReason: z.nativeEnum(DeclineReason, {
      errorMap: () => ({ message: "Pick a reason." }),
    }),
    declineReasonText: z
      .string()
      .trim()
      .max(500, "Please keep the reason under 500 characters.")
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (input.declineReason === DeclineReason.Other && !input.declineReasonText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["declineReasonText"],
        message: "Tell the learner why.",
      });
    }
  });

export type DeclineInput = z.infer<typeof declineInputSchema>;

function isAdmin(actor: Actor) {
  return actor.role === UserRole.Admin;
}

/**
 * How far a learner has watched a course: the furthest point reached in each
 * lesson, summed. Counts all watching on the course, across every purchase and
 * after Starting Over, so buying again can't reset the Refund watch cap.
 */
export function getWatchedSeconds(
  db: Db,
  userId: number,
  courseId: number
): number {
  const lessonIds = getLessonIdsForCourse(db, courseId);
  if (lessonIds.length === 0) return 0;

  return db
    .select({
      furthest: sql<number>`max(${videoWatchEvents.positionSeconds})`,
    })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds)
      )
    )
    .groupBy(videoWatchEvents.lessonId)
    .all()
    .reduce((total, row) => total + row.furthest, 0);
}

function countCompletedLessons(db: Db, userId: number, lessonIds: number[]) {
  if (lessonIds.length === 0) return 0;
  const row = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        eq(lessonProgress.status, LessonProgressStatus.Completed),
        inArray(lessonProgress.lessonId, lessonIds)
      )
    )
    .get();
  return row?.count ?? 0;
}

/** "1h12", "2h", "45m". */
function formatWatchTime(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

function describeProgress(
  watchedSeconds: number,
  lessonsCompleted: number,
  lessonCount: number
): string {
  return (
    `${formatWatchTime(watchedSeconds)} of ` +
    `${formatWatchTime(REFUND_WATCH_CAP_SECONDS)} watched · ` +
    `${lessonsCompleted} of ${lessonCount} lessons completed`
  );
}

/**
 * The Refund Requests a Reviewer may see. Open ones come oldest first (first
 * in, first out); decided ones come most recently decided first.
 */
export function listRefundRequests(
  db: Db,
  reviewer: Actor,
  filter: RefundRequestFilter
) {
  const status = FILTER_STATUS[filter];
  const conditions = [eq(refunds.status, status)];
  if (!isAdmin(reviewer)) {
    conditions.push(eq(courses.instructorId, reviewer.id));
  }

  const rows = db
    .select({
      id: refunds.id,
      status: refunds.status,
      reason: refunds.reason,
      requestedAt: refunds.requestedAt,
      resolvedAt: refunds.resolvedAt,
      amountRefunded: refunds.amountRefunded,
      declineReason: refunds.declineReason,
      declineReasonText: refunds.declineReasonText,
      refundState: refunds.refundState,
      failedNote: refunds.failedNote,
      purchaseId: purchases.id,
      amountPaid: purchases.amountPaid,
      purchasedAt: purchases.createdAt,
      learnerId: users.id,
      learnerName: users.name,
      learnerEmail: users.email,
      courseId: courses.id,
      courseTitle: courses.title,
      courseSlug: courses.slug,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(and(...conditions))
    .orderBy(
      filter === "open" ? asc(refunds.requestedAt) : desc(refunds.resolvedAt)
    )
    .all();

  const lessonIdsByCourse = new Map<number, number[]>();
  return rows.map((row) => {
    let lessonIds = lessonIdsByCourse.get(row.courseId);
    if (!lessonIds) {
      lessonIds = getLessonIdsForCourse(db, row.courseId);
      lessonIdsByCourse.set(row.courseId, lessonIds);
    }
    const watchedSeconds = getWatchedSeconds(db, row.learnerId, row.courseId);
    const lessonsCompleted = countCompletedLessons(
      db,
      row.learnerId,
      lessonIds
    );
    return {
      ...row,
      declineReasonLabel: declineReasonLabel(
        row.declineReason,
        row.declineReasonText
      ),
      watchedSeconds,
      lessonsCompleted,
      lessonCount: lessonIds.length,
      progressSummary: describeProgress(
        watchedSeconds,
        lessonsCompleted,
        lessonIds.length
      ),
    };
  });
}

/** An email the learner gets. No mail transport yet, so routes log it. */
export type Email = { to: string; subject: string; body: string };

function getRequestWithPurchase(db: Db, refundRequestId: number) {
  return db
    .select({
      request: refunds,
      purchase: purchases,
      course: courses,
      learner: users,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .innerJoin(courses, eq(purchases.courseId, courses.id))
    .innerJoin(users, eq(purchases.userId, users.id))
    .where(eq(refunds.id, refundRequestId))
    .get();
}

/**
 * Loads an Open Refund Request the reviewer may decide. Throws 403 for
 * anyone who isn't its Reviewer, 404 if it doesn't exist, and 409 if it has
 * already been decided — decisions are final.
 */
function getOpenRequestForReviewer(
  db: Db,
  reviewer: Actor,
  refundRequestId: number
) {
  if (reviewer.role !== UserRole.Admin && reviewer.role !== UserRole.Instructor) {
    throw data("Only Reviewers can decide Refund Requests.", { status: 403 });
  }

  const found = getRequestWithPurchase(db, refundRequestId);
  if (!found) {
    throw data("Refund Request not found.", { status: 404 });
  }

  if (!isAdmin(reviewer) && found.course.instructorId !== reviewer.id) {
    throw data("You can only decide Refund Requests on your own courses.", {
      status: 403,
    });
  }

  if (found.request.status !== RefundStatus.Open) {
    throw data("This Refund Request has already been decided.", {
      status: 409,
    });
  }

  return found;
}

function signOff(lines: string[], learnerName: string) {
  return [`Hi ${learnerName},`, "", ...lines, "", "— The Cadence team"].join(
    "\n"
  );
}

/**
 * Approves an Open Refund Request. Creates a Pending Refund for the full
 * amount paid and ends the learner's access by deleting their enrollment;
 * progress is kept (ADR 0001).
 */
export function approveRefundRequest(
  db: Db,
  reviewer: Actor,
  refundRequestId: number
): { email: Email } {
  const { request, purchase, course, learner } = getOpenRequestForReviewer(
    db,
    reviewer,
    refundRequestId
  );
  // A claimed seat belongs to the team; the learner couldn't have raised the
  // request with one, but a seat may have been claimed since.
  const claimedSeat = db
    .select({ id: coupons.id })
    .from(coupons)
    .where(
      and(eq(coupons.purchaseId, purchase.id), isNotNull(coupons.redeemedAt))
    )
    .get();
  if (claimedSeat) {
    throw data("A seat on this team licence has been claimed since.", {
      status: 409,
    });
  }

  const now = new Date().toISOString();

  db.transaction((tx) => {
    tx.update(refunds)
      .set({
        status: RefundStatus.Approved,
        amountRefunded: purchase.amountPaid,
        refundState: RefundState.Pending,
        resolvedAt: now,
        resolvedByUserId: reviewer.id,
      })
      .where(eq(refunds.id, request.id))
      .run();

    tx.delete(enrollments)
      .where(
        and(
          eq(enrollments.userId, purchase.userId),
          eq(enrollments.courseId, purchase.courseId)
        )
      )
      .run();

    // Refunding a team licence makes its unclaimed seats unusable.
    tx.update(coupons)
      .set({ voidedAt: now })
      .where(
        and(eq(coupons.purchaseId, purchase.id), isNull(coupons.redeemedAt))
      )
      .run();
  });

  return {
    email: {
      to: learner.email,
      subject: `Refund approved — ${course.title}`,
      body: signOff(
        [
          `Your refund request for "${course.title}" has been approved.`,
          `We are sending you ${formatPrice(purchase.amountPaid)}, the amount you paid. You no longer have access to the course.`,
        ],
        learner.name
      ),
    },
  };
}

/**
 * Declines an Open Refund Request with a reason the learner can see. Access
 * stays, and the learner may raise a new Refund Request.
 */
export function declineRefundRequest(
  db: Db,
  reviewer: Actor,
  refundRequestId: number,
  input: DeclineInput
): { email: Email } {
  const { request, course, learner } = getOpenRequestForReviewer(
    db,
    reviewer,
    refundRequestId
  );
  const text =
    input.declineReason === DeclineReason.Other
      ? (input.declineReasonText ?? null)
      : null;

  db.update(refunds)
    .set({
      status: RefundStatus.Declined,
      declineReason: input.declineReason,
      declineReasonText: text,
      resolvedAt: new Date().toISOString(),
      resolvedByUserId: reviewer.id,
    })
    .where(eq(refunds.id, request.id))
    .run();

  return {
    email: {
      to: learner.email,
      subject: `Refund request declined — ${course.title}`,
      body: signOff(
        [
          `We have declined your refund request for "${course.title}".`,
          `Reason: ${declineReasonLabel(input.declineReason, text)}`,
          "",
          "You still have access to the course. If you think we got this wrong, you can raise a new refund request from the course page.",
        ],
        learner.name
      ),
    },
  };
}

/**
 * Moves an approved request's Refund from one state to another. Only Admins
 * carry out Refunds. Throws 409 when the Refund isn't in the `from` state —
 * including when there is no Refund at all.
 */
function moveRefund(
  db: Db,
  admin: Actor,
  refundRequestId: number,
  from: RefundState,
  to: RefundState,
  // Only set when failing; kept afterwards as the record of what went wrong.
  failedNote?: string
) {
  if (!isAdmin(admin)) {
    throw data("Only Admins can carry out Refunds.", { status: 403 });
  }

  const found = getRequestWithPurchase(db, refundRequestId);
  if (!found) {
    throw data("Refund Request not found.", { status: 404 });
  }

  if (found.request.refundState !== from) {
    throw data(`Only a ${from} Refund can become ${to}.`, { status: 409 });
  }

  db.update(refunds)
    .set({
      refundState: to,
      failedNote,
      refundStateChangedAt: new Date().toISOString(),
      refundStateChangedByUserId: admin.id,
    })
    .where(eq(refunds.id, refundRequestId))
    .run();

  return found;
}

/** An Admin has sent the money. */
export function markRefundIssued(db: Db, admin: Actor, refundRequestId: number) {
  moveRefund(
    db,
    admin,
    refundRequestId,
    RefundState.Pending,
    RefundState.Issued
  );
}

/**
 * The money couldn't be sent. The note is internal; the learner is only asked
 * to check their payment details. Access stays ended.
 */
export function markRefundFailed(
  db: Db,
  admin: Actor,
  refundRequestId: number,
  note: string
): { email: Email } {
  const trimmed = note.trim();
  // Non-admins get their 403 from moveRefund, not a 400 about the note.
  if (isAdmin(admin) && !trimmed) {
    throw data("Say why the Refund failed.", { status: 400 });
  }

  const { course, learner } = moveRefund(
    db,
    admin,
    refundRequestId,
    RefundState.Pending,
    RefundState.Failed,
    trimmed
  );

  return {
    email: {
      to: learner.email,
      subject: `We couldn't send your refund — ${course.title}`,
      body: signOff(
        [
          `We tried to send your refund for "${course.title}" but it didn't go through.`,
          "Please check that your payment details are correct. We'll be in touch to sort it out.",
        ],
        learner.name
      ),
    },
  };
}

/** Tries a Failed Refund again, which makes it Pending. */
export function retryRefund(db: Db, admin: Actor, refundRequestId: number) {
  moveRefund(
    db,
    admin,
    refundRequestId,
    RefundState.Failed,
    RefundState.Pending
  );
}

const REFUND_STATE_MESSAGES: Record<RefundState, string> = {
  [RefundState.Pending]: "Refund on its way",
  [RefundState.Issued]: "Refund sent",
  [RefundState.Failed]: "We couldn't send your refund, we'll be in touch",
};

/**
 * What the course page tells a learner about their latest decided Refund
 * Request on this course, or null. Never includes the internal Failed note.
 */
export function getRefundNotice(
  db: Db,
  userId: number,
  courseId: number
):
  | { kind: "refund"; message: string }
  | { kind: "declined"; reason: string }
  | null {
  const latest = db
    .select({
      status: refunds.status,
      refundState: refunds.refundState,
      declineReason: refunds.declineReason,
      declineReasonText: refunds.declineReasonText,
    })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(
      and(eq(purchases.userId, userId), eq(purchases.courseId, courseId))
    )
    .orderBy(desc(purchases.createdAt), desc(refunds.requestedAt))
    .get();

  if (!latest) return null;

  if (latest.status === RefundStatus.Approved && latest.refundState) {
    return { kind: "refund", message: REFUND_STATE_MESSAGES[latest.refundState] };
  }

  if (latest.status === RefundStatus.Declined) {
    const reason = declineReasonLabel(
      latest.declineReason,
      latest.declineReasonText
    );
    if (reason) return { kind: "declined", reason };
  }

  return null;
}
