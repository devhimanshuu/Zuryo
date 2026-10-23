/**
 * Idempotent demo seed: every record has a fixed id and is written with upsert, so running
 * `npm run db:seed` twice leaves exactly one copy of everything. Re-running on a later day moves
 * the demo bookings so "upcoming" stays upcoming.
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type BookingStatus, type Prisma } from "@prisma/client";
import { hashSync } from "bcryptjs";
import { DEMO_PASSWORD } from "../src/lib/auth/demo-password";
import { pgPoolConfig } from "../src/lib/db/pool";
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

const db = new PrismaClient({ adapter: new PrismaPg(pgPoolConfig(process.env.DATABASE_URL)) });

const DEMO_PASSWORD_HASH = hashSync(DEMO_PASSWORD, 10);

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
        const user = {
          name: c.name,
          email: c.email,
          role: "CUSTOMER" as const,
          passwordHash: DEMO_PASSWORD_HASH,
        };
        await tx.user.upsert({ where: { id: c.id }, create: { id: c.id, ...user }, update: user });
        const details = plan.profileDetails[c.id];
        const profile = {
          serviceZoneId: c.zoneId,
          addressLine: c.addressLine,
          age: c.age,
          weightKg: c.weightKg,
          fitnessGoals: c.goals,
          fitnessLevel: c.level,
          workoutPreferences: c.prefs,
          assessedAt: c.assessed ? new Date("2026-01-01T00:00:00Z") : null,
          ...(details
            ? {
                intensity: details.intensity,
                equipment: [...details.equipment],
                environment: details.environment,
                avoidExercises: details.avoidExercises,
                accommodations: details.accommodations,
                movementLimitations: details.movementLimitations,
                goalDetails: details.goalDetails,
              }
            : {}),
        };
        await tx.customerProfile.upsert({
          where: { userId: c.id },
          create: { userId: c.id, ...profile },
          update: profile,
        });
      }

      for (const t of plan.trainers) {
        const user = {
          name: t.name,
          email: t.email,
          role: "TRAINER" as const,
          passwordHash: DEMO_PASSWORD_HASH,
        };
        await tx.user.upsert({ where: { id: t.id }, create: { id: t.id, ...user }, update: user });
        const profile = {
          serviceZoneId: t.zoneId,
          specializations: [...t.specializations],
          workoutCategories: [...t.categories],
          experienceYears: t.experienceYears,
          bio: t.bio,
          isActive: true,
          baseLatitude: t.base.latitude,
          baseLongitude: t.base.longitude,
        };
        await tx.trainerProfile.upsert({
          where: { userId: t.id },
          create: { userId: t.id, ...profile },
          update: profile,
        });
      }

      const ops = {
        name: plan.operations.name,
        email: plan.operations.email,
        role: "OPERATIONS" as const,
        passwordHash: DEMO_PASSWORD_HASH,
      };
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

      // Seeded windows are replaced wholesale (two statements instead of one upsert per row: the
      // month of availability is ~330 rows and the database can be a long round trip away). Only
      // rows with seed ids are touched; windows trainers created in the app are left alone.
      await tx.trainerAvailability.deleteMany({ where: { id: { startsWith: "seed_av_" } } });
      await tx.trainerAvailability.createMany({
        data: plan.availability.map((a) => ({
          id: a.id,
          trainerId: a.trainerId,
          startAt: a.startAt,
          endAt: a.endAt,
          status: a.status,
          note: a.note,
        })),
      });

      for (const pp of plan.packagePlans) {
        const data = {
          slug: pp.slug,
          name: pp.name,
          description: pp.description,
          sessionCount: pp.sessionCount,
          price: pp.price,
          validityDays: pp.validityDays,
          sortOrder: pp.sortOrder,
          isActive: true,
        };
        await tx.packagePlan.upsert({ where: { id: pp.id }, create: { id: pp.id, ...data }, update: data });
      }

      for (const p of plan.packages) {
        const data = {
          customerId: p.customerId,
          planId: p.planId,
          name: p.name,
          totalSessions: p.totalSessions,
          pricePaid: p.pricePaid,
          basePrice: p.basePrice,
          commissionPercent: p.commissionPercent,
          commissionAmount: p.commissionAmount,
          validityDays: p.validityDays,
          purchasedAt: p.purchasedAt,
          expiresAt: p.expiresAt,
        };
        // usedSessions and status are recomputed from the ledger below, so app-made redemptions survive.
        await tx.package.upsert({
          where: { id: p.id },
          create: { id: p.id, ...data, usedSessions: p.usedSessions, status: "ACTIVE" },
          update: data,
        });
      }

      // Re-seeding on a later day moves the seeded bookings. If one of them now lands on a slot that a
      // booking made in the app already holds, the overlap constraints would reject the move. Those
      // app-made bookings are cancelled (never deleted) so the demo data stays consistent.
      // A displaced package booking gets its session back and a paid one is refunded (both simulated),
      // exactly as a normal cancellation would do.
      const seededIds = plan.bookings.map((b) => b.id);
      let displaced = 0;
      for (const b of plan.bookings.filter((b) => ACTIVE_STATUSES.includes(b.status))) {
        const clashes = await tx.booking.findMany({
          where: {
            id: { notIn: seededIds },
            status: { in: ACTIVE_STATUSES },
            startAt: { lt: b.endAt },
            endAt: { gt: b.startAt },
            OR: [{ customerId: b.customerId }, ...(b.trainerId ? [{ trainerId: b.trainerId }] : [])],
          },
          select: { id: true, packageId: true },
        });
        for (const c of clashes) {
          const now = new Date();
          await tx.booking.update({
            where: { id: c.id },
            data: {
              status: "CANCELLED",
              cancelledAt: now,
              cancellationReason: "Cancelled by a demo re-seed: a seeded booking now uses this slot",
            },
          });
          if (c.packageId) {
            await tx.packageLedgerEntry.createMany({
              data: [
                {
                  packageId: c.packageId,
                  bookingId: c.id,
                  delta: 1,
                  reason: "CANCELLATION_REFUND",
                  note: "Demo re-seed",
                },
              ],
              skipDuplicates: true,
            });
          }
          await tx.payment.updateMany({
            where: { bookingId: c.id, status: "SUCCEEDED" },
            data: { status: "REFUNDED", refundedAt: now },
          });
        }
        displaced += clashes.length;
      }
      if (displaced > 0)
        console.warn(`Cancelled ${displaced} app-made booking(s) that clashed with seed data.`);

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

      // The ledger is append-only (a database trigger rejects UPDATE/DELETE): insert missing rows only.
      await tx.packageLedgerEntry.createMany({
        data: plan.ledger.map((e) => ({
          id: e.id,
          packageId: e.packageId,
          bookingId: e.bookingId,
          delta: e.delta,
          reason: e.reason,
          createdAt: e.createdAt,
        })),
        skipDuplicates: true,
      });

      // The cached counter always equals the ledger, including redemptions made in the app.
      const now = new Date();
      for (const p of plan.packages) {
        const net = await tx.packageLedgerEntry.aggregate({
          where: { packageId: p.id },
          _sum: { delta: true },
        });
        const used = Math.min(p.totalSessions, Math.max(0, -(net._sum.delta ?? 0)));
        await tx.package.update({
          where: { id: p.id },
          data: {
            usedSessions: used,
            status: p.expiresAt <= now ? "EXPIRED" : used >= p.totalSessions ? "EXHAUSTED" : "ACTIVE",
          },
        });
      }

      for (const p of plan.payments) {
        const data = {
          bookingId: p.bookingId,
          packageId: p.packageId,
          amount: p.amount,
          baseAmount: p.baseAmount,
          commissionAmount: p.commissionAmount,
          status: p.status,
          providerReference: p.providerReference,
          idempotencyKey: p.idempotencyKey,
          failureReason: p.failureReason,
          completedAt: p.completedAt,
        };
        await tx.payment.upsert({ where: { id: p.id }, create: { id: p.id, ...data }, update: data });
      }

      for (const s of plan.sessions) {
        const data = {
          bookingId: s.bookingId,
          startedAt: s.startedAt,
          endsAt: s.endsAt,
          plannedMinutes: s.plannedMinutes,
          warningSentAt: s.warningSentAt,
          completedAt: s.completedAt,
          completionSource: s.completionSource,
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

      // Phase 4: per-goal tracking rows. Seeded ids, but targets/status reflect the demo, not the
      // live app (app-made rows have generated ids and are never touched).
      for (const g of plan.fitnessGoalTracking) {
        const data = {
          customerId: g.customerId,
          goal: g.goal,
          status: g.status,
          target: g.target,
          targetDate: g.targetDate,
        };
        await tx.fitnessGoalTracking.upsert({
          where: { id: g.id },
          create: { id: g.id, ...data },
          update: data,
        });
      }
    },
    // maxWait covers opening a cold pooled connection to a distant Neon region (the default is 2 s).
    { maxWait: 30_000, timeout: 120_000 },
  );

  const counts = {
    users: await db.user.count(),
    zones: await db.serviceZone.count(),
    availability: await db.trainerAvailability.count(),
    bookings: await db.booking.count(),
    payments: await db.payment.count(),
    packages: await db.package.count(),
    packagePlans: await db.packagePlan.count(),
    sessions: await db.sessionRecord.count(),
    notifications: await db.notification.count(),
  };
  console.log("Seeded ZuryoFit demo data:", counts);
  console.log(`Demo sign-in: any seeded email with password "${DEMO_PASSWORD}".`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
