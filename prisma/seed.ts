/**
 * Idempotent demo seed: every record has a fixed id and is written with upsert, so running
 * `npm run db:seed` twice leaves exactly one copy of everything. Re-running on a later day moves
 * the demo bookings so "upcoming" stays upcoming.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type BookingStatus, type Prisma } from "@prisma/client";
import { buildSeedPlan } from "./seed-data";

if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") {
  console.error(
    "Refusing to seed with NODE_ENV=production. Set SEED_ALLOW_PRODUCTION=1 for a demo database.",
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** Statuses that hold a slot. Must match the predicate of the overlap constraints in the migrations. */
const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "IN_PROGRESS"];

async function main() {
  const plan = buildSeedPlan(new Date());

  await db.$transaction(
    async (tx) => {
      for (const z of plan.zones) {
        const data = {
          slug: z.slug,
          name: z.name,
          city: z.city,
          latitude: z.latitude,
          longitude: z.longitude,
        };
        await tx.serviceZone.upsert({ where: { id: z.id }, create: { id: z.id, ...data }, update: data });
      }

      for (const c of plan.customers) {
        const user = { name: c.name, email: c.email, role: "CUSTOMER" as const };
        await tx.user.upsert({ where: { id: c.id }, create: { id: c.id, ...user }, update: user });
        const profile = {
          serviceZoneId: c.zoneId,
          addressLine: c.addressLine,
          age: c.age,
          weightKg: c.weightKg,
          fitnessGoals: c.goals,
          fitnessLevel: c.level,
          workoutPreferences: c.prefs,
          assessedAt: c.assessed ? new Date("2026-01-01T00:00:00Z") : null,
        };
        await tx.customerProfile.upsert({
          where: { userId: c.id },
          create: { userId: c.id, ...profile },
          update: profile,
        });
      }

      for (const t of plan.trainers) {
        const user = { name: t.name, email: t.email, role: "TRAINER" as const };
        await tx.user.upsert({ where: { id: t.id }, create: { id: t.id, ...user }, update: user });
        const profile = {
          serviceZoneId: t.zoneId,
          specializations: [...t.specializations],
          workoutCategories: [...t.categories],
          experienceYears: t.experienceYears,
          bio: t.bio,
          isActive: true,
        };
        await tx.trainerProfile.upsert({
          where: { userId: t.id },
          create: { userId: t.id, ...profile },
          update: profile,
        });
      }

      const ops = { name: plan.operations.name, email: plan.operations.email, role: "OPERATIONS" as const };
      await tx.user.upsert({
        where: { id: plan.operations.id },
        create: { id: plan.operations.id, ...ops },
        update: ops,
      });

      for (const r of plan.pricingRules) {
        const data = {
          name: r.name,
          kind: r.kind,
          sessionPrice: r.sessionPrice,
          commissionPercent: r.commissionPercent,
          isActive: true,
        };
        await tx.pricingRule.upsert({ where: { id: r.id }, create: { id: r.id, ...data }, update: data });
      }
      for (const w of plan.peakWindows) {
        const data = {
          pricingRuleId: "seed_pricing_peak",
          label: w.label,
          daysOfWeek: w.daysOfWeek,
          startMinute: w.startMinute,
          endMinute: w.endMinute,
        };
        await tx.peakWindow.upsert({ where: { id: w.id }, create: { id: w.id, ...data }, update: data });
      }

      for (const a of plan.availability) {
        const data = {
          trainerId: a.trainerId,
          startAt: a.startAt,
          endAt: a.endAt,
          status: a.status,
          note: a.note,
        };
        await tx.trainerAvailability.upsert({
          where: { id: a.id },
          create: { id: a.id, ...data },
          update: data,
        });
      }

      for (const p of plan.packages) {
        const data = {
          customerId: p.customerId,
          name: p.name,
          totalSessions: p.totalSessions,
          usedSessions: p.usedSessions,
          pricePaid: p.pricePaid,
          purchasedAt: p.purchasedAt,
          status: p.usedSessions >= p.totalSessions ? ("EXHAUSTED" as const) : ("ACTIVE" as const),
        };
        await tx.package.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
      }

      // Re-seeding on a later day moves the seeded bookings. If one of them now lands on a slot that a
      // booking made in the app already holds, the overlap constraints would reject the move. Those
      // app-made bookings are cancelled (never deleted) so the demo data stays consistent.
      const seededIds = plan.bookings.map((b) => b.id);
      let displaced = 0;
      for (const b of plan.bookings.filter((b) => ACTIVE_STATUSES.includes(b.status))) {
        const res = await tx.booking.updateMany({
          where: {
            id: { notIn: seededIds },
            status: { in: ACTIVE_STATUSES },
            startAt: { lt: b.endAt },
            endAt: { gt: b.startAt },
            OR: [{ customerId: b.customerId }, ...(b.trainerId ? [{ trainerId: b.trainerId }] : [])],
          },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancellationReason: "Cancelled by a demo re-seed: a seeded booking now uses this slot",
          },
        });
        displaced += res.count;
      }
      if (displaced > 0) console.warn(`Cancelled ${displaced} app-made booking(s) that clashed with seed data.`);

      for (const b of plan.bookings) {
        const data = {
          reference: b.reference,
          customerId: b.customerId,
          trainerId: b.trainerId,
          serviceZoneId: b.zoneId,
          packageId: b.packageId ?? null,
          mode: b.mode,
          status: b.status,
          startAt: b.startAt,
          endAt: b.endAt,
          workoutCategory: b.category,
          customerNotes: b.customerNotes ?? null,
          pricingRuleId: b.pricingRuleId,
          isPeak: b.isPeak,
          sessionPrice: b.sessionPrice,
          commissionPercent: b.commissionPercent,
          commissionAmount: b.commissionAmount,
          totalAmount: b.totalAmount,
          cancelledAt: b.cancelledAt,
          cancellationReason: b.cancelled ? "Customer cancelled (demo)" : null,
          cancelledById: b.cancelled ? b.customerId : null,
        };
        await tx.booking.upsert({ where: { id: b.id }, create: { id: b.id, ...data }, update: data });
      }

      for (const e of plan.ledger) {
        const data = {
          packageId: e.packageId,
          bookingId: e.bookingId,
          delta: e.delta,
          reason: e.reason,
          createdAt: e.createdAt,
        };
        await tx.packageLedgerEntry.upsert({
          where: { id: e.id },
          create: { id: e.id, ...data },
          update: data,
        });
      }

      for (const p of plan.payments) {
        const data = {
          bookingId: p.bookingId,
          amount: p.amount,
          status: p.status,
          providerReference: p.providerReference,
          idempotencyKey: p.idempotencyKey,
          failureReason: p.failureReason,
        };
        await tx.payment.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
      }

      for (const s of plan.sessions) {
        const data = {
          bookingId: s.bookingId,
          startedAt: s.startedAt,
          endsAt: s.endsAt,
          warningSentAt: s.warningSentAt,
          completedAt: s.completedAt,
          activities: s.activities as Prisma.InputJsonValue,
          trainerNotes: s.trainerNotes,
          suggestedNextWorkout: s.suggestedNextWorkout,
          customerFeedback: s.customerFeedback,
        };
        await tx.sessionRecord.upsert({ where: { id: s.id }, create: { id: s.id, ...data }, update: data });
      }

      for (const n of plan.notifications) {
        const data = {
          recipientId: n.recipientId,
          bookingId: n.bookingId,
          type: n.type,
          title: n.title,
          message: n.message,
          createdAt: n.createdAt,
          readAt: n.readAt,
        };
        await tx.notification.upsert({ where: { id: n.id }, create: { id: n.id, ...data }, update: data });
      }
    },
    { timeout: 60_000 },
  );

  const counts = {
    users: await db.user.count(),
    zones: await db.serviceZone.count(),
    availability: await db.trainerAvailability.count(),
    bookings: await db.booking.count(),
    payments: await db.payment.count(),
    packages: await db.package.count(),
    sessions: await db.sessionRecord.count(),
    notifications: await db.notification.count(),
  };
  console.log("Seeded Zuryo demo data:", counts);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
