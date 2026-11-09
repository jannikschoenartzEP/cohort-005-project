import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "~/db";
import {
  enrollments,
  lessonProgress,
  lessons,
  modules,
  purchases,
  refunds,
  videoWatchEvents,
  ProgressChoice,
  RefundStatus,
} from "~/db/schema";

// ─── Learner progress after a Refund ───
// An approved Refund deletes the enrollment and keeps progress (ADR 0001). A
// learner who buys again chooses Continuing or Starting Over. Starting Over
// hides progress last touched before the current enrollment's enrolledAt; it
// never deletes anything, and the Refund watch cap still counts it.

/**
 * A `where` condition on `lesson_progress` that keeps only the rows the learner
 * may see. Add it to every learner-facing progress query. Works across courses.
 */
export function visibleProgress() {
  return sql`not exists (
    select 1 from ${enrollments}
    inner join ${modules} on ${modules.courseId} = ${enrollments.courseId}
    inner join ${lessons} on ${lessons.moduleId} = ${modules.id}
    where ${enrollments.userId} = ${lessonProgress.userId}
      and ${lessons.id} = ${lessonProgress.lessonId}
      and ${enrollments.progressChoice} = ${ProgressChoice.StartingOver}
      and (${lessonProgress.updatedAt} is null
        or ${lessonProgress.updatedAt} < ${enrollments.enrolledAt})
  )`;
}

export function getLessonIdsForCourse(db: Db, courseId: number): number[] {
  return db
    .select({ id: lessons.id })
    .from(lessons)
    .innerJoin(modules, eq(lessons.moduleId, modules.id))
    .where(eq(modules.courseId, courseId))
    .all()
    .map((row) => row.id);
}

function findEnrollment(db: Db, userId: number, courseId: number) {
  return db
    .select()
    .from(enrollments)
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .get();
}

/** The learner's progress rows on a course, as they should see them. */
export function getVisibleLessonProgress(
  db: Db,
  userId: number,
  courseId: number
) {
  const lessonIds = getLessonIdsForCourse(db, courseId);
  if (lessonIds.length === 0) return [];

  return db
    .select()
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        inArray(lessonProgress.lessonId, lessonIds),
        visibleProgress()
      )
    )
    .all();
}

function hasBeenRefunded(db: Db, userId: number, courseId: number) {
  return !!db
    .select({ id: refunds.id })
    .from(refunds)
    .innerJoin(purchases, eq(refunds.purchaseId, purchases.id))
    .where(
      and(
        eq(purchases.userId, userId),
        eq(purchases.courseId, courseId),
        eq(refunds.status, RefundStatus.Approved)
      )
    )
    .get();
}

/**
 * True when a learner who bought the course again after a Refund has progress
 * from before this enrollment and hasn't yet chosen Continuing or Starting
 * Over. Asked once.
 */
export function needsProgressChoice(
  db: Db,
  userId: number,
  courseId: number
): boolean {
  const enrollment = findEnrollment(db, userId, courseId);
  if (!enrollment || enrollment.progressChoice) return false;
  if (!hasBeenRefunded(db, userId, courseId)) return false;

  const lessonIds = getLessonIdsForCourse(db, courseId);
  if (lessonIds.length === 0) return false;

  const earlierProgress = db
    .select({ id: lessonProgress.id })
    .from(lessonProgress)
    .where(
      and(
        eq(lessonProgress.userId, userId),
        inArray(lessonProgress.lessonId, lessonIds),
        or(
          isNull(lessonProgress.updatedAt),
          lt(lessonProgress.updatedAt, enrollment.enrolledAt)
        )
      )
    )
    .get();
  if (earlierProgress) return true;

  const earlierWatching = db
    .select({ id: videoWatchEvents.id })
    .from(videoWatchEvents)
    .where(
      and(
        eq(videoWatchEvents.userId, userId),
        inArray(videoWatchEvents.lessonId, lessonIds),
        lt(videoWatchEvents.createdAt, enrollment.enrolledAt)
      )
    )
    .get();
  return !!earlierWatching;
}

/** Records a returning learner's choice on their current enrollment. */
export function chooseProgress(
  db: Db,
  userId: number,
  courseId: number,
  choice: ProgressChoice
) {
  db.update(enrollments)
    .set({ progressChoice: choice })
    .where(
      and(eq(enrollments.userId, userId), eq(enrollments.courseId, courseId))
    )
    .run();
}
