import { and, eq } from "drizzle-orm";
import { coupons, courses, enrollments, purchases, users } from "~/db/schema";
import type { Db } from "~/db";
import { personOf, type Notification } from "~/lib/notifications";
import { getSeatAvailability } from "~/lib/refunds.server";

// ─── Seats ───
// A Student claiming a Seat on a Team Licence. See GLOSSARY.md (Seat, Claimed
// Seat, Team Admin). Database first, positional parameters, like refunds.

export const SEAT_ON_HOLD =
  "This seat can't be claimed right now. Ask the person who shared it with you.";
export const SEAT_REFUNDED =
  "This seat is no longer available. Ask the person who shared it with you.";

export type ClaimResult =
  | { ok: true; courseSlug: string; notifications: Notification[] }
  | { ok: false; error: string };

export function claimSeat(
  db: Db,
  code: string,
  studentId: number,
  studentCountry: string,
  now: Date
): ClaimResult {
  const seat = db.select().from(coupons).where(eq(coupons.code, code)).get();
  if (!seat) {
    return { ok: false, error: "Coupon not found" };
  }

  const availability = getSeatAvailability(db, seat);
  if (availability === "claimed") {
    return { ok: false, error: "Coupon has already been redeemed" };
  }
  if (availability === "on_hold") {
    return { ok: false, error: SEAT_ON_HOLD };
  }
  if (availability === "refunded") {
    return { ok: false, error: SEAT_REFUNDED };
  }

  const alreadyEnrolled = db
    .select()
    .from(enrollments)
    .where(
      and(
        eq(enrollments.userId, studentId),
        eq(enrollments.courseId, seat.courseId)
      )
    )
    .get();
  if (alreadyEnrolled) {
    return { ok: false, error: "You are already enrolled in this course" };
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, seat.purchaseId))
    .get();
  if (purchase?.country && purchase.country !== studentCountry) {
    return {
      ok: false,
      error:
        "This coupon can only be redeemed from the same country as the purchaser",
    };
  }

  const course = db
    .select()
    .from(courses)
    .where(eq(courses.id, seat.courseId))
    .get();
  const student = db.select().from(users).where(eq(users.id, studentId)).get();
  if (!purchase || !course || !student) {
    return { ok: false, error: "Coupon not found" };
  }

  db.transaction((tx) => {
    tx.update(coupons)
      .set({ redeemedByUserId: studentId, redeemedAt: now.toISOString() })
      .where(eq(coupons.id, seat.id))
      .run();
    tx.insert(enrollments)
      .values({ userId: studentId, courseId: seat.courseId })
      .run();
  });

  return {
    ok: true,
    courseSlug: course.slug,
    notifications: seatClaimedNotifications(db, purchase, course.title, student),
  };
}

function seatClaimedNotifications(
  db: Db,
  purchase: typeof purchases.$inferSelect,
  courseTitle: string,
  student: typeof users.$inferSelect
): Notification[] {
  // The Team Admin claiming a Seat on their own Team Licence needs no news.
  if (purchase.userId === student.id) return [];

  const teamAdmin = db
    .select()
    .from(users)
    .where(eq(users.id, purchase.userId))
    .get();
  if (!teamAdmin) return [];

  const seats = db
    .select()
    .from(coupons)
    .where(eq(coupons.purchaseId, purchase.id))
    .all();
  const unclaimed = seats.filter((seat) => seat.redeemedByUserId === null);

  return [
    {
      kind: "seat-claimed",
      recipient: personOf(teamAdmin),
      actor: personOf(student),
      title: `${student.name} claimed a Seat on ${courseTitle}`,
      body: `${unclaimed.length} of ${seats.length} Seats are still unclaimed.`,
      link: "/team",
    },
  ];
}
