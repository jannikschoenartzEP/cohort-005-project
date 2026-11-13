import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { CourseStatus, UserRole } from "~/db/schema";
import { changeCourseStatus } from "./courses.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12);

describe("changing a course's status", () => {
  let db: TestDb;
  let base: ReturnType<typeof seedBaseData>;
  let platformAdmin: typeof schema.users.$inferSelect;

  beforeEach(() => {
    db = createTestDb();
    base = seedBaseData(db);
    platformAdmin = db
      .insert(schema.users)
      .values({ name: "Pat Admin", email: "pat@example.com", role: UserRole.Admin })
      .returning()
      .get();
    db.update(schema.courses)
      .set({ status: CourseStatus.Draft })
      .where(eq(schema.courses.id, base.course.id))
      .run();
  });

  it("notifies the Instructor when a Platform Admin publishes their course", () => {
    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Published,
      platformAdmin.id,
      NOW
    );

    expect(result).toEqual({
      success: true,
      notifications: [
        {
          kind: "course-status-changed",
          recipient: {
            id: base.instructor.id,
            name: "Test Instructor",
            email: base.instructor.email,
          },
          actor: { id: platformAdmin.id, name: "Pat Admin", email: "pat@example.com" },
          title: "A Platform Admin published Test Course",
          link: `/instructor/${base.course.id}`,
        },
      ],
    });
  });

  it.each([
    [CourseStatus.Draft, CourseStatus.Published, "A Platform Admin moved to draft Test Course"],
    [CourseStatus.Archived, CourseStatus.Draft, "A Platform Admin archived Test Course"],
  ])("titles a move to %s", (status, from, title) => {
    db.update(schema.courses)
      .set({ status: from })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    const result = changeCourseStatus(db, base.course.id, status, platformAdmin.id, NOW);

    expect(result.success && result.notifications.map((n) => n.title)).toEqual([title]);
  });

  it("stores the new status", () => {
    changeCourseStatus(db, base.course.id, CourseStatus.Archived, platformAdmin.id, NOW);

    const course = db
      .select()
      .from(schema.courses)
      .where(eq(schema.courses.id, base.course.id))
      .get();
    expect(course?.status).toBe(CourseStatus.Archived);
  });

  it("doesn't notify a Platform Admin who is the course's Instructor", () => {
    db.update(schema.courses)
      .set({ instructorId: platformAdmin.id })
      .where(eq(schema.courses.id, base.course.id))
      .run();

    const result = changeCourseStatus(
      db,
      base.course.id,
      CourseStatus.Published,
      platformAdmin.id,
      NOW
    );

    expect(result).toEqual({ success: true, notifications: [] });
  });
});
