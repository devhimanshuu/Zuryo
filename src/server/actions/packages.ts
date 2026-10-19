"use server";

import { revalidatePath } from "next/cache";
import { getActor } from "@/server/auth/actor";
import { defaultDeps } from "@/server/booking/deps";
import type { ServiceResult } from "@/server/booking/errors";
import {
  discardCheckout,
  payForPackage,
  startPackageCheckout,
  type PackagePaymentResult,
} from "@/server/packages/package-service";
import { runAction } from "./run";

/* Customer package purchase. The acting customer is resolved on the server; prices come from the database. */

export async function startPackageCheckoutAction(input: unknown): Promise<ServiceResult<{ packageId: string }>> {
  return runAction("packages:checkout", async () => startPackageCheckout(defaultDeps(), await getActor("CUSTOMER"), input));
}

export async function payForPackageAction(input: unknown): Promise<ServiceResult<PackagePaymentResult>> {
  return runAction("packages:pay", async () => {
    const result = await payForPackage(defaultDeps(), await getActor("CUSTOMER"), input);
    revalidatePath("/customer", "layout");
    revalidatePath("/operations", "layout");
    return result;
  });
}

export async function discardCheckoutAction(input: unknown): Promise<ServiceResult<{ packageId: string }>> {
  return runAction("packages:discard", async () => {
    const result = await discardCheckout(defaultDeps(), await getActor("CUSTOMER"), input);
    if (result.ok) revalidatePath("/customer/packages");
    return result;
  });
}
