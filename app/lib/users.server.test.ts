import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { UserRole } from "~/db/schema";
import { changeUserRole } from "./users.server";

type TestDb = ReturnType<typeof createTestDb>;

describe("changing someone's role", () => {
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
  });

  it("tells a Student they're now an Instructor", () => {
    const result = changeUserRole(db, base.user.id, UserRole.Instructor, platformAdmin.id);

    expect(result).toEqual({
      success: true,
      notifications: [
        {
          kind: "role-changed",
          recipient: { id: base.user.id, name: "Test User", email: "test@example.com" },
          actor: { id: platformAdmin.id, name: "Pat Admin", email: "pat@example.com" },
          title: "You're now an Instructor on Cadence",
          link: "/instructor",
        },
      ],
    });
  });

  it.each([
    [UserRole.Student, "You're now a Student on Cadence", "/dashboard"],
    [UserRole.Admin, "You're now a Platform Admin on Cadence", "/admin/users"],
  ])("titles and links a change to %s", (role, title, link) => {
    const result = changeUserRole(db, base.instructor.id, role, platformAdmin.id);

    expect(
      result.success && result.notifications.map((n) => ({ title: n.title, link: n.link }))
    ).toEqual([{ title, link }]);
  });

  it("stores the new role", () => {
    changeUserRole(db, base.user.id, UserRole.Admin, platformAdmin.id);

    const user = db.select().from(schema.users).where(eq(schema.users.id, base.user.id)).get();
    expect(user?.role).toBe(UserRole.Admin);
  });

  it("doesn't notify a Platform Admin who changes their own role", () => {
    const result = changeUserRole(db, platformAdmin.id, UserRole.Instructor, platformAdmin.id);

    expect(result).toEqual({ success: true, notifications: [] });
  });

  it("doesn't notify when the role stays the same", () => {
    const result = changeUserRole(db, base.user.id, UserRole.Student, platformAdmin.id);

    expect(result).toEqual({ success: true, notifications: [] });
  });

  it("fails for a user who doesn't exist", () => {
    const result = changeUserRole(db, 9999, UserRole.Student, platformAdmin.id);

    expect(result).toEqual({ success: false, error: "User not found." });
  });
});
