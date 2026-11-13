import { describe, it, expect, beforeEach } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";
import { RefundStatus, UserRole } from "~/db/schema";
import { claimSeat } from "./seats.server";

type TestDb = ReturnType<typeof createTestDb>;

const NOW = new Date(2026, 9, 6, 12, 0, 0);

let db: TestDb;
let base: ReturnType<typeof seedBaseData>;
let teamAdmin: typeof schema.users.$inferSelect;

beforeEach(() => {
  db = createTestDb();
  base = seedBaseData(db);
  teamAdmin = addStudent("Tina");
});

function addStudent(name: string) {
  return db
    .insert(schema.users)
    .values({
      name,
      email: `${name.toLowerCase()}@example.com`,
      role: UserRole.Student,
    })
    .returning()
    .get();
}

function buySeats(buyerId: number, count: number, country: string | null = "DE") {
  const team = db.insert(schema.teams).values({}).returning().get();
  const purchase = db
    .insert(schema.purchases)
    .values({
      userId: buyerId,
      courseId: base.course.id,
      amountPaid: 7900 * count,
      country,
    })
    .returning()
    .get();
  const seats = Array.from({ length: count }, (_, i) =>
    db
      .insert(schema.coupons)
      .values({
        teamId: team.id,
        courseId: base.course.id,
        code: `SEAT-${purchase.id}-${i}`,
        purchaseId: purchase.id,
      })
      .returning()
      .get()
  );
  return { purchase, seats };
}

function isEnrolled(userId: number) {
  return !!db
    .select()
    .from(schema.enrollments)
    .where(
      and(
        eq(schema.enrollments.userId, userId),
        eq(schema.enrollments.courseId, base.course.id)
      )
    )
    .get();
}

describe("claiming a Seat", () => {
  it("enrolls the Student and tells the Team Admin how many Seats are still unclaimed", () => {
    const { seats } = buySeats(teamAdmin.id, 3);
    const sam = addStudent("Sam");

    const result = claimSeat(db, seats[0].code, sam.id, "DE", NOW);

    if (!result.success) throw new Error(result.error);
    expect(isEnrolled(sam.id)).toBe(true);
    expect(result.courseSlug).toBe("test-course");
    expect(result.notifications).toEqual([
      {
        kind: "seat-claimed",
        recipient: { id: teamAdmin.id, name: "Tina", email: "tina@example.com" },
        actor: { id: sam.id, name: "Sam", email: "sam@example.com" },
        title: "Sam claimed a Seat on Test Course",
        body: "2 of 3 Seats are still unclaimed.",
        link: "/team",
      },
    ]);
  });

  it("sends nothing when the Team Admin claims a Seat on their own Team Licence", () => {
    const { seats } = buySeats(teamAdmin.id, 3);

    const result = claimSeat(db, seats[0].code, teamAdmin.id, "DE", NOW);

    if (!result.success) throw new Error(result.error);
    expect(isEnrolled(teamAdmin.id)).toBe(true);
    expect(result.notifications).toEqual([]);
  });

  it("refuses a Claimed Seat and sends nothing", () => {
    const { seats } = buySeats(teamAdmin.id, 3);
    const sam = addStudent("Sam");
    const kim = addStudent("Kim");
    claimSeat(db, seats[0].code, sam.id, "DE", NOW);

    const result = claimSeat(db, seats[0].code, kim.id, "DE", NOW);

    expect(result).toEqual({
      success: false,
      error: "Coupon has already been redeemed",
    });
    expect(isEnrolled(kim.id)).toBe(false);
  });

  it("refuses a Seat on hold while its Team Licence has an Open Refund Request", () => {
    const { purchase, seats } = buySeats(teamAdmin.id, 3);
    db.insert(schema.refunds)
      .values({
        purchaseId: purchase.id,
        status: RefundStatus.Open,
        reason: "Team changed plans.",
        requestedAt: NOW.toISOString(),
      })
      .run();
    const sam = addStudent("Sam");

    const result = claimSeat(db, seats[0].code, sam.id, "DE", NOW);

    expect(result).toEqual({
      success: false,
      error:
        "This seat can't be claimed right now. Ask the person who shared it with you.",
    });
    expect(isEnrolled(sam.id)).toBe(false);
  });

  it("refuses a refunded Seat", () => {
    const { seats } = buySeats(teamAdmin.id, 3);
    db.update(schema.coupons)
      .set({ refundedAt: NOW.toISOString() })
      .where(eq(schema.coupons.id, seats[0].id))
      .run();
    const sam = addStudent("Sam");

    const result = claimSeat(db, seats[0].code, sam.id, "DE", NOW);

    expect(result).toEqual({
      success: false,
      error:
        "This seat is no longer available. Ask the person who shared it with you.",
    });
    expect(isEnrolled(sam.id)).toBe(false);
  });

  it("refuses a Student claiming from another country than the buyer's", () => {
    const { seats } = buySeats(teamAdmin.id, 3, "DE");
    const sam = addStudent("Sam");

    const result = claimSeat(db, seats[0].code, sam.id, "FR", NOW);

    expect(result.success).toBe(false);
    expect(isEnrolled(sam.id)).toBe(false);
  });
});
