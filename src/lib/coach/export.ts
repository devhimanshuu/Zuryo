import type { CoachMessageView } from "./thread";

/** Plain-text transcript of a conversation, oldest first, for saving, copying or sharing. */
export function formatTranscript(
  messages: Array<Pick<CoachMessageView, "role" | "content" | "createdAt">>,
  options: { customerName?: string; exportedAt?: Date } = {},
): string {
  const who = options.customerName?.trim() || "You";
  const when = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleString("en-IN", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
  };
  const header = [
    "ZuryoFit Coach conversation",
    options.exportedAt ? `Exported ${when(options.exportedAt.toISOString())}` : null,
    "General fitness guidance, not medical advice.",
  ].filter(Boolean);
  const body = messages.map((m) => {
    const stamp = when(m.createdAt);
    return `${m.role === "USER" ? who : "Coach"}${stamp ? ` · ${stamp}` : ""}\n${m.content.trim()}`;
  });
  return [header.join("\n"), ...body].join("\n\n---\n\n") + "\n";
}

/** A file name safe on every platform, e.g. zuryofit-coach-2026-10-23.txt. */
export function transcriptFileName(date: Date): string {
  return `zuryofit-coach-${date.toISOString().slice(0, 10)}.txt`;
}
