import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { LessonProgressStatus, ProgressChoice } from "~/db/schema";
import {
  chooseProgress,
  getVisibleLessonProgress,
  needsProgressChoice,
} from "./progress.server";
import { getWatchedSeconds } from "./refunds.server";

type TestDb = ReturnType<typeof createTestDb>;

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let lessonIds: number[];

const FIRST_PURCHASE = "2026-10-01T10:00:00.000Z";
const EARLIER = "2026-10-02T10:00:00.000Z";
const BOUGHT_AGAIN = "2026-11-01T10:00:00.000Z";
const LATER = "2026-11-02T10:00:00.000Z";

function enrol(enrolledAt: string) {
  db.insert(schema.enrollments)
    .values({ userId: base.user.id, courseId: base.course.id, enrolledAt })
    .run();
}

function unenrol() {
  db.delete(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, base.user.id),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .run();
}

function progress(lessonId: number, status: LessonProgressStatus, at: string) {
  db.insert(schema.lessonProgress)
    .values({
      userId: base.user.id,
      lessonId,
      status,
      completedAt: status === LessonProgressStatus.Completed ? at : null,
      updatedAt: at,
    })
    .run();
}

function watch(lessonId: number, positionSeconds: number, createdAt: string) {
  db.insert(schema.videoWatchEvents)
    .values({ userId: base.user.id, lessonId, eventType: "progress", positionSeconds, createdAt })
    .run();
}

function visibleLessonIds() {
  return getVisibleLessonProgress(db, base.user.id, base.course.id)
    .map((row) => row.lessonId)
    .sort();
}

function purchase(createdAt: string) {
  return db
    .insert(schema.purchases)
    .values({ userId: base.user.id, courseId: base.course.id, amountPaid: 7900, createdAt })
    .returning()
    .get();
}

function approvedRefund(purchaseId: number) {
  db.insert(schema.refunds)
    .values({
      purchaseId,
      reason: "Not what I expected at all.",
      status: schema.RefundStatus.Approved,
      refundState: schema.RefundState.Issued,
      amountRefunded: 7900,
    })
    .run();
}

/** A learner who made progress, was refunded, and bought the course again. */
function returningLearner() {
  approvedRefund(purchase(FIRST_PURCHASE).id);
  purchase(BOUGHT_AGAIN);
  enrol(FIRST_PURCHASE);
  progress(lessonIds[0], LessonProgressStatus.Completed, EARLIER);
  progress(lessonIds[1], LessonProgressStatus.InProgress, EARLIER);
  watch(lessonIds[0], 1800, EARLIER);
  unenrol();
  enrol(BOUGHT_AGAIN);
}

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  const mod = db
    .insert(schema.modules)
    .values({ courseId: base.course.id, title: "Module", position: 1 })
    .returning()
    .get();
  lessonIds = [1, 2, 3].map(
    (position) =>
      db
        .insert(schema.lessons)
        .values({ moduleId: mod.id, title: `Lesson ${position}`, position })
        .returning()
        .get().id
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe("coming back after a Refund", () => {
  it("asks a returning learner with earlier progress to choose, once", () => {
    returningLearner();

    expect(needsProgressChoice(db, base.user.id, base.course.id)).toBe(true);
    chooseProgress(db, base.user.id, base.course.id, ProgressChoice.Continuing);
    expect(needsProgressChoice(db, base.user.id, base.course.id)).toBe(false);
  });

  it("doesn't ask a learner whose older progress is from their only purchase", () => {
    purchase(FIRST_PURCHASE);
    enrol(BOUGHT_AGAIN);
    // Rows from before updated_at existed have it null.
    db.insert(schema.lessonProgress)
      .values({ userId: base.user.id, lessonId: lessonIds[0], status: LessonProgressStatus.Completed, updatedAt: null })
      .run();
    progress(lessonIds[1], LessonProgressStatus.Completed, EARLIER);

    expect(needsProgressChoice(db, base.user.id, base.course.id)).toBe(false);
  });

  it("doesn't ask a first-time learner", () => {
    enrol(FIRST_PURCHASE);

    expect(needsProgressChoice(db, base.user.id, base.course.id)).toBe(false);
  });

  it("shows earlier progress to a learner who hasn't chosen yet or is Continuing", () => {
    returningLearner();
    expect(visibleLessonIds()).toEqual([lessonIds[0], lessonIds[1]]);

    chooseProgress(db, base.user.id, base.course.id, ProgressChoice.Continuing);
    expect(visibleLessonIds()).toEqual([lessonIds[0], lessonIds[1]]);
  });

  it("hides earlier progress after Starting Over, and shows progress made since", () => {
    returningLearner();
    chooseProgress(db, base.user.id, base.course.id, ProgressChoice.StartingOver);

    expect(visibleLessonIds()).toEqual([]);

    progress(lessonIds[2], LessonProgressStatus.Completed, LATER);
    expect(visibleLessonIds()).toEqual([lessonIds[2]]);
  });

  it("shows a lesson again once it's touched after Starting Over", () => {
    returningLearner();
    chooseProgress(db, base.user.id, base.course.id, ProgressChoice.StartingOver);

    vi.setSystemTime(LATER);
    db.update(schema.lessonProgress)
      .set({ status: LessonProgressStatus.Completed, completedAt: LATER })
      .where(eq(schema.lessonProgress.lessonId, lessonIds[1]))
      .run();

    expect(visibleLessonIds()).toEqual([lessonIds[1]]);
  });

  it("never deletes earlier progress, and the watch cap still counts it", () => {
    returningLearner();
    chooseProgress(db, base.user.id, base.course.id, ProgressChoice.StartingOver);

    expect(getWatchedSeconds(db, base.user.id, base.course.id)).toBe(1800);
    expect(db.select().from(schema.lessonProgress).all()).toHaveLength(2);
  });
});
