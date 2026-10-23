"use client";

import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils/cn";

const FEEDBACK_TAGS = {
  positive: ["Clear explanation", "Great exercise", "Helpful tip", "Personalized"],
  negative: ["Too complex", "Not relevant", "Missing context", "Too long"],
} as const;

export type CoachFeedbackProps = {
  messageId: string;
  className?: string;
};

/**
 * Thumbs-up / thumbs-down rating with optional fine-grained tags. Feedback is stored in
 * localStorage keyed by message ID so ratings persist across panel open/close. A future
 * integration could POST these to a server endpoint for model tuning.
 */
export function CoachFeedback({ messageId, className }: CoachFeedbackProps) {
  const storageKey = `zuryofit:coach-fb:${messageId}`;

  const [rating, setRating] = useState<"positive" | "negative" | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && "rating" in parsed) {
        const r = (parsed as { rating: unknown }).rating;
        if (r === "positive" || r === "negative") return r;
      }
    } catch {
      /* ignore */
    }
    return null;
  });

  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed === "object" && parsed !== null && "tags" in parsed) {
        const t = (parsed as { tags: unknown }).tags;
        if (Array.isArray(t)) return t as string[];
      }
    } catch {
      /* ignore */
    }
    return [];
  });

  const [showTags, setShowTags] = useState(false);

  function save(newRating: "positive" | "negative", tags: string[]) {
    try {
      localStorage.setItem(storageKey, JSON.stringify({ rating: newRating, tags }));
    } catch {
      /* storage full or unavailable */
    }
  }

  function handleRate(value: "positive" | "negative") {
    if (rating === value) {
      // Toggle off
      setRating(null);
      setSelectedTags([]);
      setShowTags(false);
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
      return;
    }
    setRating(value);
    setSelectedTags([]);
    setShowTags(true);
    save(value, []);
    toast.success(value === "positive" ? "Thanks for the feedback!" : "We'll try to do better");
  }

  function toggleTag(tag: string) {
    if (!rating) return;
    setSelectedTags((prev) => {
      const next = prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag];
      save(rating, next);
      return next;
    });
  }

  const tags = rating ? FEEDBACK_TAGS[rating] : [];

  return (
    <div className={cn("mt-1", className)}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => handleRate("positive")}
          className={cn(
            "rounded p-1 transition-colors",
            rating === "positive"
              ? "bg-success-soft text-success"
              : "text-ink-subtle hover:bg-raised hover:text-ink",
          )}
          aria-label="Helpful"
          title="This was helpful"
        >
          <ThumbsUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => handleRate("negative")}
          className={cn(
            "rounded p-1 transition-colors",
            rating === "negative"
              ? "bg-danger-soft text-danger"
              : "text-ink-subtle hover:bg-raised hover:text-ink",
          )}
          aria-label="Not helpful"
          title="This wasn't helpful"
        >
          <ThumbsDown className="size-3.5" />
        </button>

        {rating && !showTags && selectedTags.length === 0 && (
          <button
            type="button"
            onClick={() => setShowTags(true)}
            className="ml-1 text-[10px] text-ink-subtle hover:text-ink"
          >
            Tell us more
          </button>
        )}
      </div>

      {showTags && tags.length > 0 && (
        <div className="mt-1.5 flex animate-fade-in flex-wrap gap-1">
          {tags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                selectedTags.includes(tag)
                  ? rating === "positive"
                    ? "border-success bg-success-soft text-success"
                    : "border-danger bg-danger-soft text-danger"
                  : "border-hairline bg-raised text-ink-muted hover:border-brand hover:text-brand",
              )}
            >
              {tag}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowTags(false)}
            className="text-[10px] text-ink-subtle hover:text-ink"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}
