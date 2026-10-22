"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";

/** Copies a value to the clipboard with a short "Copied" state and honest failure feedback. */
export function CopyButton({
  value,
  label = "Copy",
  copiedLabel = "Copied",
  iconOnly = false,
  variant = "secondary",
  size = "sm",
  className,
}: {
  value: string;
  label?: string;
  copiedLabel?: string;
  /** Icon-only rendering for dense rows; the label becomes the accessible name. */
  iconOnly?: boolean;
} & Pick<ButtonProps, "variant" | "size" | "className">) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied to clipboard");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it manually.");
    }
  }
  if (iconOnly) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        aria-label={label}
        title={label}
        onClick={() => void copy()}
      >
        {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      </Button>
    );
  }
  return (
    <Button type="button" variant={variant} size={size} className={className} onClick={() => void copy()}>
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
