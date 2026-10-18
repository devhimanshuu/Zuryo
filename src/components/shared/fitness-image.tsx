"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import type { SiteImage } from "@/lib/config/images";

/**
 * Photography with a calm fallback: if the image fails to load, a tinted block with the caption
 * takes its place so a broken asset never breaks the layout.
 */
export function FitnessImage({
  image,
  className,
  sizes,
  priority,
}: {
  image: SiteImage;
  className?: string;
  sizes: string;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn("relative overflow-hidden bg-sunken", className)}>
      {failed ? (
        <div
          className="absolute inset-0 grid place-items-start bg-brand-soft p-4"
          role="img"
          aria-label={image.alt}
        >
          <span className="max-w-[28ch] text-body-sm text-brand">{image.alt}</span>
        </div>
      ) : (
        <Image
          src={image.src}
          alt={image.alt}
          fill
          sizes={sizes}
          priority={priority}
          className="object-cover"
          style={{ objectPosition: image.position ?? "center" }}
          onError={() => setFailed(true)}
        />
      )}
    </div>
  );
}
