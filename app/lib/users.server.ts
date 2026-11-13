import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "~/db/schema";
import { UserRole, users } from "~/db/schema";
import type { Notification, NotificationPerson } from "~/lib/notifications";

// ─── Users ───
// Platform Admin changes to a user. Database first, Notifications returned
// for the route to hand to notify().

type Db = BetterSQLite3Database<typeof schema>;

export type ChangeUserRoleResult =
  | { success: true; notifications: Notification[] }
  | { success: false; error: string };

const ROLE_NAMES: Record<UserRole, string> = {
  [UserRole.Student]: "a Student",
  [UserRole.Instructor]: "an Instructor",
  [UserRole.Admin]: "a Platform Admin",
};

/**
 * Where each role starts out: the first item in that role's sidebar.
 */
export const ROLE_LANDING_PAGES: Record<UserRole, string> = {
  [UserRole.Student]: "/dashboard",
  [UserRole.Instructor]: "/instructor",
  [UserRole.Admin]: "/admin/users",
};

export function changeUserRole(
  db: Db,
  userId: number,
  role: UserRole,
  platformAdminId: number
): ChangeUserRoleResult {
  const before = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!before) {
    return { success: false, error: "User not found." };
  }

  const user = db
    .update(users)
    .set({ role })
    .where(eq(users.id, userId))
    .returning()
    .get();
  if (!user) {
    return { success: false, error: "User not found." };
  }

  // Nothing to announce if the role didn't change, or on a self-change.
  if (before.role === role || user.id === platformAdminId) {
    return { success: true, notifications: [] };
  }

  const platformAdmin = db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, platformAdminId))
    .get();
  const recipient: NotificationPerson = {
    id: user.id,
    name: user.name,
    email: user.email,
  };

  return {
    success: true,
    notifications: [
      {
        kind: "role-changed",
        recipient,
        actor: platformAdmin ?? null,
        title: `You're now ${ROLE_NAMES[role]} on Cadence`,
        link: ROLE_LANDING_PAGES[role],
      },
    ],
  };
}
