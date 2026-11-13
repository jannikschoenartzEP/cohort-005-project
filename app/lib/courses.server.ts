import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { CourseStatus, courses, users } from "~/db/schema";
import type { Notification, NotificationPerson } from "~/lib/notifications";

// ─── Courses ───
// Platform Admin changes to a course. Database first, Notifications returned
// for the route to hand to notify().

type Db = BetterSQLite3Database<typeof schema>;

export type ChangeCourseStatusResult =
  | { ok: true; notifications: Notification[] }
  | { ok: false; error: string };

const STATUS_VERBS: Record<CourseStatus, string> = {
  [CourseStatus.Published]: "published",
  [CourseStatus.Draft]: "moved to draft",
  [CourseStatus.Archived]: "archived",
};

export function changeCourseStatus(
  db: Db,
  courseId: number,
  status: CourseStatus,
  platformAdminId: number,
  now: Date
): ChangeCourseStatusResult {
  const before = db
    .select({ status: courses.status })
    .from(courses)
    .where(eq(courses.id, courseId))
    .get();
  if (!before) {
    return { ok: false, error: "Course not found." };
  }

  const course = db
    .update(courses)
    .set({ status, updatedAt: now.toISOString() })
    .where(eq(courses.id, courseId))
    .returning()
    .get();
  if (!course) {
    return { ok: false, error: "Course not found." };
  }

  // Nothing to announce if the status didn't change, or the Platform Admin
  // changed their own course.
  if (before.status === status || course.instructorId === platformAdminId) {
    return { ok: true, notifications: [] };
  }

  const instructor = getPerson(db, course.instructorId);
  const platformAdmin = getPerson(db, platformAdminId);
  if (!instructor) {
    return { ok: true, notifications: [] };
  }

  return {
    ok: true,
    notifications: [
      {
        kind: "course-status-changed",
        recipient: instructor,
        actor: platformAdmin ?? null,
        title: `A Platform Admin ${STATUS_VERBS[status]} ${course.title}`,
        link: `/instructor/${course.id}`,
      },
    ],
  };
}

function getPerson(db: Db, userId: number): NotificationPerson | undefined {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .get();
}
