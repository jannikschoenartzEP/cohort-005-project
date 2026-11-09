import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { and, eq } from "drizzle-orm";
import {
  approveRefundRequest,
  declineRefundRequest,
  declineInputSchema,
  getWatchedSeconds,
  markRefundFailed,
  markRefundIssued,
  retryRefund,
  listRefundRequests,
} from "./refunds.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let admin: typeof schema.users.$inferSelect;

function addUser(name: string, role: UserRole) {
  return db
    .insert(schema.users)
    .values({ name, email: `${name.toLowerCase()}@example.com`, role })
    .returning()
    .get();
}

function addCourse(title: string, instructorId: number) {
  return db
    .insert(schema.courses)
    .values({
      title,
      slug: title.toLowerCase().replace(/\s+/g, "-"),
      description: title,
      salesCopy: title,
      instructorId,
      categoryId: base.category.id,
      status: schema.CourseStatus.Published,
      price: 9900,
    })
    .returning()
    .get();
}

function buy(userId: number, courseId: number, amountPaid = 7900, createdAt = "2026-11-01T10:00:00.000Z") {
  db.insert(schema.enrollments).values({ userId, courseId }).run();
  return db
    .insert(schema.purchases)
    .values({ userId, courseId, amountPaid, createdAt })
    .returning()
    .get();
}

function requestRefund(purchaseId: number, requestedAt: string, reason = "Not what I expected at all.") {
  return db
    .insert(schema.refunds)
    .values({ purchaseId, reason, requestedAt, status: RefundStatus.Open })
    .returning()
    .get();
}

function addLessons(courseId: number, count: number) {
  const mod = db
    .insert(schema.modules)
    .values({ courseId, title: "Module", position: 1 })
    .returning()
    .get();
  return Array.from({ length: count }, (_, i) =>
    db
      .insert(schema.lessons)
      .values({ moduleId: mod.id, title: `Lesson ${i + 1}`, position: i + 1 })
      .returning()
      .get()
  );
}

function watch(userId: number, lessonId: number, positionSeconds: number, createdAt = "2026-11-02T10:00:00.000Z") {
  db.insert(schema.videoWatchEvents)
    .values({ userId, lessonId, eventType: "progress", positionSeconds, createdAt })
    .run();
}

function complete(userId: number, lessonId: number, at = "2026-11-02T10:00:00.000Z") {
  db.insert(schema.lessonProgress)
    .values({
      userId,
      lessonId,
      status: schema.LessonProgressStatus.Completed,
      completedAt: at,
      updatedAt: at,
    })
    .run();
}

function isEnrolled(userId: number, courseId: number) {
  // Every access check reads this row (ADR 0001), so its absence is what
  // "access ended" means.
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, courseId)
      )
    )
    .get();
}

/** The HTTP status of the response a service throws. */
function thrownStatus(run: () => unknown): number | undefined {
  try {
    run();
  } catch (thrown) {
    if (thrown && typeof thrown === "object" && "init" in thrown) {
      const init = (thrown as { init?: { status?: number } }).init;
      return init?.status;
    }
    throw thrown;
  }
  return undefined;
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  admin = addUser("Ada", UserRole.Admin);
});

describe("listRefundRequests", () => {
  it("shows an Instructor only the Open Refund Requests on their own courses, oldest first", () => {
    const otherInstructor = addUser("Olga", UserRole.Instructor);
    const otherCourse = addCourse("Other Course", otherInstructor.id);
    const bob = addUser("Bob", UserRole.Student);

    const newer = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-05T10:00:00.000Z");
    const older = requestRefund(buy(bob.id, base.course.id).id, "2026-11-03T10:00:00.000Z");
    requestRefund(buy(bob.id, otherCourse.id).id, "2026-11-02T10:00:00.000Z");

    const rows = listRefundRequests(db, base.instructor, "open");

    expect(rows.map((row) => row.id)).toEqual([older.id, newer.id]);
  });

  it("shows an Admin Open Refund Requests on every course", () => {
    const otherInstructor = addUser("Olga", UserRole.Instructor);
    const otherCourse = addCourse("Other Course", otherInstructor.id);

    requestRefund(buy(base.user.id, base.course.id).id, "2026-11-05T10:00:00.000Z");
    requestRefund(buy(base.user.id, otherCourse.id).id, "2026-11-02T10:00:00.000Z");

    expect(listRefundRequests(db, admin, "open")).toHaveLength(2);
  });

  it("describes each request with the learner, the purchase and their progress", () => {
    const lessons = addLessons(base.course.id, 18);
    const purchase = buy(base.user.id, base.course.id, 7900, "2026-11-01T09:00:00.000Z");
    // Furthest point per lesson counts: 40 min + 32 min = 1h12.
    watch(base.user.id, lessons[0].id, 600);
    watch(base.user.id, lessons[0].id, 2400);
    watch(base.user.id, lessons[1].id, 1920);
    for (const lesson of lessons.slice(0, 5)) complete(base.user.id, lesson.id);

    requestRefund(purchase.id, "2026-11-04T10:00:00.000Z", "It was too basic for me.");

    const [row] = listRefundRequests(db, admin, "open");

    expect(row).toMatchObject({
      learnerName: "Test User",
      learnerEmail: "test@example.com",
      courseTitle: "Test Course",
      amountPaid: 7900,
      purchasedAt: "2026-11-01T09:00:00.000Z",
      requestedAt: "2026-11-04T10:00:00.000Z",
      reason: "It was too basic for me.",
      progressSummary: "1h12 of 2h watched · 5 of 18 lessons completed",
    });
  });
});

describe("approveRefundRequest", () => {
  it("creates a Pending Refund for the full amount paid and ends access, keeping progress", () => {
    const [lesson] = addLessons(base.course.id, 3);
    const purchase = buy(base.user.id, base.course.id, 7900);
    watch(base.user.id, lesson.id, 900);
    complete(base.user.id, lesson.id);
    const request = requestRefund(purchase.id, "2026-11-04T10:00:00.000Z");

    const { email } = approveRefundRequest(db, base.instructor, request.id);

    const [approved] = listRefundRequests(db, admin, "approved");
    expect(approved).toMatchObject({
      id: request.id,
      amountRefunded: 7900,
      refundState: schema.RefundState.Pending,
      progressSummary: "15m of 2h watched · 1 of 3 lessons completed",
    });
    expect(listRefundRequests(db, admin, "open")).toEqual([]);
    expect(isEnrolled(base.user.id, base.course.id)).toBe(false);
    expect(getWatchedSeconds(db, base.user.id, base.course.id)).toBe(900);
    expect(email.to).toBe("test@example.com");
    expect(email.body).toContain("$79.00");
  });

  it("is final: an approved request can't be decided again", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");
    approveRefundRequest(db, admin, request.id);

    expect(thrownStatus(() => approveRefundRequest(db, admin, request.id))).toBe(409);
  });

  it("refuses an Instructor deciding a request on someone else's course", () => {
    const otherInstructor = addUser("Olga", UserRole.Instructor);
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");

    expect(thrownStatus(() => approveRefundRequest(db, otherInstructor, request.id))).toBe(403);
    expect(isEnrolled(base.user.id, base.course.id)).toBe(true);
  });

  it("refuses a learner", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");

    expect(thrownStatus(() => approveRefundRequest(db, base.user, request.id))).toBe(403);
  });
});

describe("approveRefundRequest on a team licence", () => {
  function buyTeamLicence(seats: number) {
    const purchase = db
      .insert(schema.purchases)
      .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900 * seats })
      .returning()
      .get();
    const team = db.insert(schema.teams).values({}).returning().get();
    const codes = Array.from({ length: seats }, (_, i) => `seat-${i}`);
    for (const code of codes) {
      db.insert(schema.coupons)
        .values({ teamId: team.id, courseId: base.course.id, code, purchaseId: purchase.id })
        .run();
    }
    return { purchase, codes };
  }

  function seat(code: string) {
    return db.select().from(schema.coupons).where(eq(schema.coupons.code, code)).get();
  }

  it("makes every unclaimed seat unusable", () => {
    const { purchase, codes } = buyTeamLicence(3);
    const request = requestRefund(purchase.id, "2026-11-04T10:00:00.000Z");

    approveRefundRequest(db, admin, request.id);

    for (const code of codes) {
      expect(seat(code)?.voidedAt).not.toBeNull();
    }
  });

  it("refuses once a seat has been claimed since the request was raised", () => {
    const { purchase, codes } = buyTeamLicence(2);
    const request = requestRefund(purchase.id, "2026-11-04T10:00:00.000Z");
    const bob = addUser("Bob", UserRole.Student);
    db.update(schema.coupons)
      .set({ redeemedByUserId: bob.id, redeemedAt: "2026-11-05T10:00:00.000Z" })
      .where(eq(schema.coupons.code, codes[0]))
      .run();

    expect(thrownStatus(() => approveRefundRequest(db, admin, request.id))).toBe(409);
    expect(seat(codes[1])?.voidedAt).toBeNull();
  });
});

describe("declineRefundRequest", () => {
  it("records a preset reason, keeps access and tells the learner why", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");

    const { email } = declineRefundRequest(db, base.instructor, request.id, {
      declineReason: schema.DeclineReason.MatchesDescription,
    });

    const [declined] = listRefundRequests(db, admin, "declined");
    expect(declined).toMatchObject({
      id: request.id,
      declineReasonLabel: "Course matches its description",
      amountRefunded: null,
      refundState: null,
    });
    expect(isEnrolled(base.user.id, base.course.id)).toBe(true);
    expect(email.body).toContain("Course matches its description");
  });

  it("shows the free text when the reason is Other", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");

    declineRefundRequest(db, admin, request.id, {
      declineReason: schema.DeclineReason.Other,
      declineReasonText: "You bought it during a sale that excluded refunds.",
    });

    const [declined] = listRefundRequests(db, admin, "declined");
    expect(declined.declineReasonLabel).toBe(
      "You bought it during a sale that excluded refunds."
    );
  });

  it("is final", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");
    declineRefundRequest(db, admin, request.id, { declineReason: schema.DeclineReason.Duplicate });

    expect(
      thrownStatus(() =>
        declineRefundRequest(db, admin, request.id, { declineReason: schema.DeclineReason.Duplicate })
      )
    ).toBe(409);
  });

  describe("declineInputSchema", () => {
    it("requires a reason", () => {
      expect(declineInputSchema.safeParse({}).success).toBe(false);
    });

    it("requires free text when the reason is Other", () => {
      expect(
        declineInputSchema.safeParse({ declineReason: "other", declineReasonText: "  " }).success
      ).toBe(false);
    });

    it("accepts a preset reason on its own", () => {
      expect(
        declineInputSchema.safeParse({ declineReason: "too_much_completed" }).success
      ).toBe(true);
    });
  });
});

describe("carrying out a Refund", () => {
  function approvedRequest() {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");
    approveRefundRequest(db, base.instructor, request.id);
    return request;
  }

  function refundState(id: number) {
    return listRefundRequests(db, admin, "approved").find((row) => row.id === id)?.refundState;
  }

  it("lets an Admin mark a Pending Refund Issued", () => {
    const request = approvedRequest();

    markRefundIssued(db, admin, request.id);

    expect(refundState(request.id)).toBe(schema.RefundState.Issued);
  });

  it("refuses an Instructor, even on their own course", () => {
    const request = approvedRequest();

    expect(thrownStatus(() => markRefundIssued(db, base.instructor, request.id))).toBe(403);
    expect(thrownStatus(() => markRefundFailed(db, base.instructor, request.id, "Bounced"))).toBe(403);
    expect(refundState(request.id)).toBe(schema.RefundState.Pending);
  });

  it("marks a Refund Failed with an internal note and asks the learner to check their details", () => {
    const request = approvedRequest();

    const { email } = markRefundFailed(db, admin, request.id, "IBAN holder name doesn't match");

    const row = listRefundRequests(db, admin, "approved")[0];
    expect(row.refundState).toBe(schema.RefundState.Failed);
    expect(row.failedNote).toBe("IBAN holder name doesn't match");
    expect(email.body).toContain("payment details");
    expect(email.body).not.toContain("IBAN holder name");
  });

  it("requires a note to mark a Refund Failed", () => {
    const request = approvedRequest();

    expect(thrownStatus(() => markRefundFailed(db, admin, request.id, "   "))).toBe(400);
    expect(refundState(request.id)).toBe(schema.RefundState.Pending);
  });

  it("retries a Failed Refund, making it Pending again", () => {
    const request = approvedRequest();
    markRefundFailed(db, admin, request.id, "Bounced");

    retryRefund(db, admin, request.id);

    expect(refundState(request.id)).toBe(schema.RefundState.Pending);
  });

  it("only moves a Refund along the allowed steps", () => {
    const request = approvedRequest();

    expect(thrownStatus(() => retryRefund(db, admin, request.id))).toBe(409);
    markRefundIssued(db, admin, request.id);
    expect(thrownStatus(() => markRefundFailed(db, admin, request.id, "Late bounce"))).toBe(409);
  });

  it("has no Refund to carry out on an Open Refund Request", () => {
    const request = requestRefund(buy(base.user.id, base.course.id).id, "2026-11-04T10:00:00.000Z");

    expect(thrownStatus(() => markRefundIssued(db, admin, request.id))).toBe(409);
  });
});
