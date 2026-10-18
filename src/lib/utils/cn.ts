import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge must know our custom font-size names, or `text-body-md text-ink` would collapse to one. */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display-xl",
            "display-lg",
            "display-md",
            "heading-lg",
            "heading-md",
            "body-lg",
            "body-md",
            "body-sm",
            "eyebrow",
            "numeric-xl",
            "numeric-lg",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
