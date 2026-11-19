import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, seedBaseData, type TestDb } from "~/test/setup";
import * as schema from "~/db/schema";
import { markdown } from "~/lib/text";
import { getInstructorAnalytics } from "./instructor-analytics.server";

// Far from today on purpose: if any figure still read the real clock, these
// tests would fail rather than pass by coincidence.
const NOW = new Date(2026, 9, 6, 12, 0, 0);

function daysBefore(days: number) {
  const when = new Date(NOW);
  when.setDate(when.getDate() - days);
  return when.toISOString();
}

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
});

function asInstructor() {
  return { userId: base.instructor.id, isAdmin: false };
}

// The analytics module only reads, so there is no module function to arrange
// through: rows go in directly.
function purchase(daysAgo: number, amountPaid = 10_000) {
  return db
    .insert(schema.purchases)
    .values({
      userId: base.user.id,
      courseId: base.course.id,
      amountPaid,
      createdAt: daysBefore(daysAgo),
    })
    .returning()
    .get();
}

function analytics(params = "", viewer = asInstructor(), now = NOW) {
  return getInstructorAnalytics(db, viewer, new URLSearchParams(params), now);
}

describe("refund exposure", () => {
  it("counts purchases still inside their fourteen-day window, on the day passed in", () => {
    purchase(3, 1_000);
    purchase(14, 2_000); // last day to ask is today
    purchase(15, 4_000); // window closed yesterday

    const { refundExposure } = analytics();

    expect(refundExposure.grossCents).toBe(3_000);
    expect(refundExposure.netCents).toBe(2_400);
    expect(refundExposure.purchaseCount).toBe(2);
    expect(refundExposure.closingTodayCount).toBe(1);
    expect(refundExposure.sharePercent).toBe(43); // 3000 of 7000
    expect(refundExposure.courses).toEqual([
      {
        courseId: base.course.id,
        title: "Test Course",
        grossCents: 3_000,
        purchaseCount: 2,
        daysLeft: 0,
      },
    ]);
  });
});

describe("the range", () => {
  it("measures thirty days back from the moment passed in, including a sale exactly on the boundary", () => {
    const boundary = new Date(NOW.getTime() - 30 * 86_400_000);
    for (const createdAt of [
      boundary.toISOString(),
      new Date(boundary.getTime() - 1).toISOString(),
    ]) {
      db.insert(schema.purchases)
        .values({
          userId: base.user.id,
          courseId: base.course.id,
          amountPaid: 5_000,
          createdAt,
        })
        .run();
    }

    const { summary } = analytics("range=30d");

    expect(summary).toEqual({
      grossCents: 5_000,
      feeCents: 1_000,
      netCents: 4_000,
      purchaseCount: 1,
    });
  });

  it("draws the revenue chart up to the day passed in", () => {
    purchase(2, 1_000);

    const { series } = analytics("range=7d");

    expect(series.granularity).toBe("day");
    expect(series.points.at(-1)?.bucket).toBe(NOW.toISOString().slice(0, 10));
    expect(series.points.map((point) => point.grossCents)).toContain(1_000);
  });
});

describe("who sees what", () => {
  function otherInstructorsCourse() {
    const other = db
      .insert(schema.users)
      .values({
        name: "Other Instructor",
        email: "other@example.com",
        role: schema.UserRole.Instructor,
      })
      .returning()
      .get();
    const course = db
      .insert(schema.courses)
      .values({
        title: "Other Course",
        slug: "other-course",
        description: "Someone else's",
        salesCopy: base.course.salesCopy,
        instructorId: other.id,
        categoryId: base.category.id,
        status: schema.CourseStatus.Published,
      })
      .returning()
      .get();
    db.insert(schema.purchases)
      .values({
        userId: base.user.id,
        courseId: course.id,
        amountPaid: 9_000,
        createdAt: daysBefore(1),
      })
      .run();
    return { other, course };
  }

  it("pins an Instructor to their own figures whatever the URL asks for", () => {
    purchase(1, 1_000);
    const { other, course } = otherInstructorsCourse();

    const result = analytics(`instructor=${other.id}&course=${course.id}`);

    expect(result.instructorId).toBe(base.instructor.id);
    expect(result.summary.grossCents).toBe(1_000);
    expect(result.selectedCourseId).toBeNull();
    expect(result.countries).toBeNull();
  });

  it("lets a Platform Admin look at any one Instructor, or everyone when none is picked", () => {
    purchase(1, 1_000);
    const { other, course } = otherInstructorsCourse();
    const admin = { userId: base.user.id, isAdmin: true };

    const one = analytics(`instructor=${other.id}&course=${course.id}`, admin);
    const everyone = analytics("", admin);

    expect(one.summary.grossCents).toBe(9_000);
    expect(one.selectedCourseId).toBe(course.id);
    expect(everyone.instructorId).toBeNull();
    expect(everyone.summary.grossCents).toBe(10_000);
  });
});

describe("unanswered Discussion Questions", () => {
  it("splits them at the start of the range, and drops the ones the Instructor answered", () => {
    const module = db
      .insert(schema.modules)
      .values({ courseId: base.course.id, title: "Basics", position: 1 })
      .returning()
      .get();
    const lesson = db
      .insert(schema.lessons)
      .values({ moduleId: module.id, title: "Lesson 1", position: 1 })
      .returning()
      .get();
    const ask = (userId: number, daysAgo: number, parentId?: number) =>
      db
        .insert(schema.comments)
        .values({
          lessonId: lesson.id,
          userId,
          parentId,
          body: markdown("A comment"),
          createdAt: daysBefore(daysAgo),
        })
        .returning()
        .get();

    ask(base.user.id, 2);
    ask(base.user.id, 40);
    const answered = ask(base.user.id, 3);
    ask(base.instructor.id, 1, answered.id);

    const { questions } = analytics("range=30d");

    expect(questions).toEqual({ inRange: 1, older: 1 });
  });
});
