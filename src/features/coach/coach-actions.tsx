"use client";

import { Check, Copy, MessageSquareQuote, Sparkles, Volume2, VolumeX, Wand2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

export type CoachActionsProps = {
  content: string;
  onSendPrompt?: (prompt: string) => void;
  disabled?: boolean;
};

export function CoachActions({ content, onSendPrompt, disabled }: CoachActionsProps) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [supportedTTS, setSupportedTTS] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      setSupportedTTS(true);
    }
    return () => {
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy text");
    }
  }

  function toggleTTS() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    // Clean out markdown asterisks and hash symbols before speaking
    const clean = content.replace(/[*_#`~>]/g, "").replace(/\n+/g, ". ");
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  function handleFlagForTrainer() {
    const summary = content.slice(0, 180);
    const textToShare = `Note for Trainer:\nCoach advice: "${summary}..."`;
    navigator.clipboard.writeText(textToShare).then(
      () => {
        toast.success("Note formatted and copied for your trainer!");
      },
      () => {
        toast.info("Note ready for your next session.");
      },
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 border-t border-hairline/40 pt-1.5 text-xs text-ink-muted">
      {/* Primary actions */}
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          className="h-7 px-2 text-ink-muted hover:text-ink"
          title="Copy response"
          aria-label="Copy response"
        >
          {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
          <span className="ml-1 text-[11px]">{copied ? "Copied" : "Copy"}</span>
        </Button>

        {supportedTTS && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleTTS}
            className={cn(
              "h-7 px-2 text-ink-muted transition-colors hover:text-ink",
              speaking && "bg-brand-soft font-semibold text-brand",
            )}
            title={speaking ? "Stop reading" : "Read aloud"}
            aria-label={speaking ? "Stop reading aloud" : "Read aloud"}
          >
            {speaking ? (
              <>
                <VolumeX className="size-3 text-brand" />
                <span className="ml-1 text-[11px]">Stop</span>
                <span className="ml-1 inline-flex gap-0.5">
                  <span className="size-1 animate-pulse rounded-full bg-brand" />
                  <span className="size-1 animate-pulse rounded-full bg-brand delay-75" />
                  <span className="size-1 animate-pulse rounded-full bg-brand delay-150" />
                </span>
              </>
            ) : (
              <>
                <Volume2 className="size-3" />
                <span className="ml-1 text-[11px]">Listen</span>
              </>
            )}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleFlagForTrainer}
          className="h-7 px-2 text-ink-muted hover:text-ink"
          title="Copy note for your trainer"
          aria-label="Copy note for trainer"
        >
          <MessageSquareQuote className="size-3" />
          <span className="ml-1 text-[11px]">For Trainer</span>
        </Button>
      </div>

      {/* Quick Follow-up Modifiers */}
      {onSendPrompt && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSendPrompt("Can you summarize this into 2-3 quick bullet points?")}
            className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-50"
            title="Get a concise summary"
          >
            <Sparkles className="size-2.5" />
            Shorter
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSendPrompt("Can you suggest an easier, beginner-friendly alternative to this?")}
            className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-[11px] font-medium text-ink-muted transition-colors hover:border-brand hover:bg-brand-soft hover:text-brand disabled:opacity-50"
            title="Make it easier"
          >
            <Wand2 className="size-2.5" />
            Easier
          </button>
        </div>
      )}
    </div>
  );
}
