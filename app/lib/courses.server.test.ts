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
});
