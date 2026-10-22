import type { CoachRouteValue } from "./scope";

/** One stored chat message, shaped for the client (dates as ISO strings). */
export type CoachMessageView = {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  /** Assistant rows: how the coach handled the question. */
  route: CoachRouteValue | null;
  /** Assistant rows: AI answer, or the rule-based reply used when no model answered. */
  source: "AI" | "RULE_BASED" | null;
  modelId: string | null;
  createdAt: string;
};

/** Short label shown beside an assistant reply that was held back by the scope or safety rules. */
export const COACH_ROUTE_NOTE: Record<Exclude<CoachRouteValue, "ANSWERED">, string> = {
  SAFETY: "Safety first",
  MEDICAL: "Not medical advice",
  OUT_OF_SCOPE: "Outside the coach's scope",
};
