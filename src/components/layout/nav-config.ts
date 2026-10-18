import {
  CalendarCheck,
  CalendarClock,
  Dumbbell,
  HeartPulse,
  House,
  IndianRupee,
  LayoutDashboard,
  ListChecks,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/lib/validation/enums";

export type NavItem = { href: string; label: string; icon: LucideIcon };

/**
 * Navigation per role. Only routes that exist are listed — later phases add items here as their
 * screens ship. Hiding a link is UX only; the server authorises every request (Phase 2+).
 */
export const NAV: Record<Role, { title: string; items: NavItem[] }> = {
  CUSTOMER: {
    title: "Customer",
    items: [
      { href: "/customer", label: "Home", icon: House },
      { href: "/customer/bookings", label: "My bookings", icon: CalendarCheck },
      { href: "/customer/fitness", label: "Fitness", icon: HeartPulse },
    ],
  },
  TRAINER: {
    title: "Trainer",
    items: [
      { href: "/trainer", label: "Overview", icon: LayoutDashboard },
      { href: "/trainer/sessions", label: "My sessions", icon: Dumbbell },
      { href: "/trainer/availability", label: "Availability", icon: CalendarClock },
    ],
  },
  OPERATIONS: {
    title: "Operations",
    items: [
      { href: "/operations", label: "Overview", icon: LayoutDashboard },
      { href: "/operations/bookings", label: "Bookings", icon: ListChecks },
      { href: "/operations/trainers", label: "Trainers", icon: Users },
      { href: "/operations/pricing", label: "Pricing rules", icon: IndianRupee },
    ],
  },
};

/** Exact match for a role's home, prefix match for everything beneath it. */
export function isActive(pathname: string, href: string, roleHome: string): boolean {
  if (href === roleHome) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}
