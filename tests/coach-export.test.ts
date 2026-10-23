import { describe, expect, it } from "vitest";
import { formatTranscript, transcriptFileName } from "@/lib/coach/export";

describe("coach transcript export", () => {
  const messages = [
    { role: "USER" as const, content: "How should I warm up?", createdAt: "2026-10-23T05:00:00.000Z" },
    { role: "ASSISTANT" as const, content: " - 5 min light cardio ", createdAt: "2026-10-23T05:00:03.000Z" },
  ];

  it("lists each turn with who said it, oldest first", () => {
    const text = formatTranscript(messages, { customerName: "Priya" });
    expect(text.indexOf("Priya")).toBeLessThan(text.indexOf("Coach ·"));
    expect(text).toContain("How should I warm up?");
    expect(text).toContain("- 5 min light cardio");
    expect(text).toContain("not medical advice");
  });

  it("names the file by date", () => {
    expect(transcriptFileName(new Date("2026-10-23T10:00:00Z"))).toBe("zuryofit-coach-2026-10-23.txt");
  });
});
