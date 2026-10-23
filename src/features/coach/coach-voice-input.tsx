"use client";

import { Mic } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

// Types for Web Speech Recognition API
interface SpeechRecognitionEventLike {
  results: {
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
    length: number;
  };
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onresult: (event: SpeechRecognitionEventLike) => void;
  onerror: (event: { error: string }) => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechConstructor = new () => SpeechRecognitionLike;

export type CoachVoiceInputProps = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
};

export function CoachVoiceInput({ onTranscript, disabled, className }: CoachVoiceInputProps) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRec = (window as unknown as {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    }).SpeechRecognition || (window as unknown as {
      SpeechRecognition?: SpeechConstructor;
      webkitSpeechRecognition?: SpeechConstructor;
    }).webkitSpeechRecognition;

    if (SpeechRec) {
      setSupported(true);
      try {
        const recognition = new SpeechRec();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-IN"; // Default to Indian English, works well with all accents

        recognition.onstart = () => {
          setListening(true);
        };

        recognition.onresult = (event: SpeechRecognitionEventLike) => {
          const current = event.results[event.results.length - 1];
          if (current && current[0]) {
            const transcript = current[0].transcript;
            onTranscript(transcript);
          }
        };

        recognition.onerror = (e) => {
          setListening(false);
          if (e.error !== "no-speech" && e.error !== "aborted") {
            toast.error("Voice input error: " + e.error);
          }
        };

        recognition.onend = () => {
          setListening(false);
        };

        recognitionRef.current = recognition;
      } catch {
        setSupported(false);
      }
    }

    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore abort cleanup */
        }
      }
    };
  }, [onTranscript]);

  if (!supported) return null;

  function toggleListening() {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      try {
        recognitionRef.current.start();
        toast.info("Listening... speak your question now");
      } catch {
        /* recognition might already be starting */
      }
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      disabled={disabled}
      onClick={toggleListening}
      aria-label={listening ? "Stop voice listening" : "Ask with voice"}
      title={listening ? "Listening... click to stop" : "Ask using voice"}
      className={cn(
        "relative size-9 transition-colors",
        listening && "text-brand bg-brand-soft hover:bg-brand-soft",
        className,
      )}
    >
      {listening ? (
        <>
          <span className="absolute inset-0 animate-ping rounded-full bg-brand opacity-30" />
          <Mic className="size-4 text-brand animate-pulse" />
        </>
      ) : (
        <Mic className="size-4 text-ink-muted hover:text-ink" />
      )}
    </Button>
  );
}
