import { Bell, HeartPulse, KeyRound, LogOut, MapPin, Palette, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ThemeControl } from "@/components/layout/theme-control";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorState } from "@/components/shared/states";
import { Avatar } from "@/components/shared/avatar";
import { Card, CardContent, CardDescription, CardHeader, CardIcon, CardTitle } from "@/components/ui/card";
import { auth } from "@/lib/auth";
import { isGoogleEnabled } from "@/lib/auth/google";
import { WORKOUT_CATEGORY_INFO } from "@/lib/booking/categories";
import { getDb } from "@/lib/db";
import { safely } from "@/lib/utils/errors";
import { formatDay } from "@/lib/utils/format";
import { ROLE_HOME, type Role } from "@/lib/validation/enums";
import { getAccount, hasFreshGoogleProof } from "@/server/account/account-service";
import { getActor } from "@/server/auth/actor";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";

const ROLE_LABEL: Record<Role, string> = {
  CUSTOMER: "Customer",
  TRAINER: "Trainer",
  OPERATIONS: "Operations",
};

/** Profile details, settings and sign-in security for the signed-in user, in any workspace. */
export async function AccountPage({ role }: { role: Role }) {
  const actor = await getActor(role);
  const session = await auth();
  const [result, zones] = await Promise.all([
    safely(() => getAccount(getDb(), actor.userId)),
    safely(() =>
      getDb().serviceZone.findMany({
        where: { isActive: true },
        orderBy: [{ city: "asc" }, { name: "asc" }],
        select: { id: true, name: true, city: true },
      }),
    ),
  ]);
  if (!result.ok || !result.data || !zones.ok) return <ErrorState message="We couldn't load your account." />;
  const account = result.data;
  const googleEnabled = isGoogleEnabled();
  const fresh = hasFreshGoogleProof({ method: session?.user?.authMethod, at: session?.user?.authAt });
  const home = ROLE_HOME[role];

  return (
    <div className="grid grid-cols-1 gap-5">
      <PageHeader
        editorial
        title="Account"
        description="Your details, sign-in security and preferences."
        className="pb-0"
      />

      <section
        aria-label="You"
        className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-gradient-to-br from-brand-soft via-raised to-raised p-5 shadow-(--shadow-1) sm:p-6"
      >
        <Avatar name={account.name} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-display-md leading-tight">{account.name}</h2>
          <p className="truncate text-body-md text-ink-muted">{account.email}</p>
          <ul className="mt-2 flex flex-wrap gap-2 text-body-sm font-semibold">
            <li className="rounded-full border border-hairline bg-raised/80 px-3 py-1">
              {ROLE_LABEL[account.role]}
            </li>
            {account.zone ? (
              <li className="inline-flex items-center gap-1 rounded-full border border-hairline bg-raised/80 px-3 py-1">
                <MapPin className="size-3.5 text-brand" aria-hidden /> {account.zone.name} ·{" "}
                {account.zone.city}
              </li>
            ) : null}
            <li className="rounded-full border border-hairline bg-raised/80 px-3 py-1">
              Member since {formatDay(account.createdAt)} {account.createdAt.getFullYear()}
            </li>
          </ul>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Profile details</CardTitle>
                <CardDescription>Update anything here except your email, which is locked.</CardDescription>
              </div>
              <CardIcon icon={UserRound} />
            </CardHeader>
            <CardContent>
              <ProfileForm
                role={role}
                zones={zones.data}
                defaults={{
                  name: account.name,
                  email: account.email,
                  phone: account.phone ?? "",
                  serviceZoneId: account.zone?.id ?? "",
                  addressLine: account.addressLine ?? "",
                  bio: account.trainer?.bio ?? "",
                  experienceYears: account.trainer?.experienceYears?.toString() ?? "",
                  specializations: account.trainer?.specializations.join(", ") ?? "",
                  workoutCategories: account.trainer?.workoutCategories ?? [],
                  acceptingBookings: account.trainer?.acceptingBookings ?? true,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>{account.hasPassword ? "Change password" : "Add a password"}</CardTitle>
                <CardDescription>
                  {account.hasPassword
                    ? "Use your current password, or verify with Google if you've forgotten it."
                    : "You signed up with Google. Add a password to also sign in with your email."}
                </CardDescription>
              </div>
              <CardIcon icon={KeyRound} />
            </CardHeader>
            <CardContent>
              <PasswordForm
                hasPassword={account.hasPassword}
                fresh={fresh}
                googleEnabled={googleEnabled}
                returnTo={`${home}/account`}
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Sign-in methods</CardTitle>
              <CardIcon icon={ShieldCheck} />
            </CardHeader>
            <CardContent className="grid gap-2.5">
              <Method
                label="Email and password"
                on={account.hasPassword}
                onText="Set up"
                offText="Not set up yet"
              />
              {role !== "OPERATIONS" ? (
                <Method
                  label="Google"
                  on={googleEnabled}
                  onText={`Works with ${account.email}`}
                  offText="Unavailable right now"
                />
              ) : (
                <p className="text-body-sm text-ink-muted">
                  Operations accounts sign in with a password only.
                </p>
              )}
            </CardContent>
          </Card>

          {account.trainer ? (
            <Card>
              <CardHeader>
                <CardTitle>How customers see you</CardTitle>
                <CardIcon icon={UserRound} />
              </CardHeader>
              <CardContent className="grid gap-2 text-body-sm">
                <p>
                  <span className="text-ink-muted">Teaches: </span>
                  <span className="font-semibold">
                    {account.trainer.workoutCategories
                      .map((c) => WORKOUT_CATEGORY_INFO[c].label)
                      .join(", ") || "Nothing selected"}
                  </span>
                </p>
                <p>
                  <span className="text-ink-muted">Experience: </span>
                  <span className="font-semibold">
                    {account.trainer.experienceYears !== null
                      ? `${account.trainer.experienceYears} years`
                      : "Not set"}
                  </span>
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
              <CardIcon icon={Palette} />
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-body-md">Theme</span>
                <ThemeControl />
              </div>
              <Link
                href={`${home}/notifications`}
                className="flex min-h-10 items-center gap-2 text-body-md font-semibold hover:text-brand"
              >
                <Bell className="size-4 text-ink-muted" aria-hidden /> Notifications
              </Link>
              {role === "CUSTOMER" ? (
                <Link
                  href="/customer/fitness?tab=profile"
                  className="flex min-h-10 items-center gap-2 text-body-md font-semibold hover:text-brand"
                >
                  <HeartPulse className="size-4 text-ink-muted" aria-hidden /> Fitness profile
                </Link>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-hairline pt-3">
                <span className="inline-flex items-center gap-2 text-body-md">
                  <LogOut className="size-4 text-ink-muted" aria-hidden /> Sign out of this device
                </span>
                <SignOutButton />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Method({
  label,
  on,
  onText,
  offText,
}: {
  label: string;
  on: boolean;
  onText: string;
  offText: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-3 py-2.5">
      <div className="min-w-0">
        <p className="font-semibold">{label}</p>
        <p className="truncate text-body-sm text-ink-muted">{on ? onText : offText}</p>
      </div>
      <span className={on ? "text-xs font-semibold text-success" : "text-xs font-semibold text-ink-subtle"}>
        {on ? "On" : "Off"}
      </span>
    </div>
  );
}
