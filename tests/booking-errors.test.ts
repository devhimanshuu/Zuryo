import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/utils/errors";
import { runAction } from "@/server/actions/run";
import { exclusionConstraint, isUniqueViolationOn, postgresCode } from "@/server/booking/errors";

// Error shapes recorded from Prisma 6.19 + @prisma/adapter-pg against PostgreSQL.
const exclusion = Object.assign(
  new Error('conflicting key value violates exclusion constraint "Booking_trainer_no_overlap"'),
  {
    name: "DriverAdapterError",
    cause: {
      originalCode: "23P01",
      kind: "postgres",
      code: "23P01",
      message: 'conflicting key value violates exclusion constraint "Booking_trainer_no_overlap"',
    },
  },
);
const uniqueIdempotency = Object.assign(new Error("Unique constraint failed"), {
  code: "P2002",
  meta: {
    modelName: "Booking",
    driverAdapterError: {
      name: "DriverAdapterError",
      cause: {
        originalCode: "23505",
        originalMessage: 'duplicate key value violates unique constraint "Booking_idempotencyKey_key"',
        kind: "UniqueConstraintViolation",
        constraint: { fields: ['"idempotencyKey"'] },
      },
    },
  },
});

describe("database error classification", () => {
  it("recognises exclusion-constraint violations and which constraint fired", () => {
    expect(postgresCode(exclusion)).toBe("23P01");
    expect(exclusionConstraint(exclusion)).toBe("Booking_trainer_no_overlap");
    expect(exclusionConstraint(new Error("connection reset"))).toBeNull();
  });

  it("recognises unique violations by column, quoted or not", () => {
    expect(isUniqueViolationOn(uniqueIdempotency, "idempotencyKey")).toBe(true);
    expect(isUniqueViolationOn(uniqueIdempotency, "reference")).toBe(false);
    expect(isUniqueViolationOn(exclusion, "idempotencyKey")).toBe(false);
  });
});

describe("runAction", () => {
  it("turns an unexpected failure into a generic error, never a success", async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const res = await runAction("test", async () => {
        throw new Error('relation "Booking" does not exist');
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe("INTERNAL");
        expect(res.error.message).not.toMatch(/relation|Booking/);
        expect(res.error.message).toMatch(/nothing was booked/i);
      }
    } finally {
      console.error = original;
    }
  });

  it("passes presentable application errors through", async () => {
    const res = await runAction("test", async () => {
      throw new AppError("UNAVAILABLE", "Pricing isn't configured yet.");
    });
    expect(res).toEqual({
      ok: false,
      error: { code: "UNAVAILABLE", message: "Pricing isn't configured yet." },
    });
  });
});
