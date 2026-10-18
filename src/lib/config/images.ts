/**
 * Landing-page photography from Unsplash (free to use under the Unsplash License,
 * https://unsplash.com/license). Swap entries here; components never hard-code image URLs.
 * Every image has a designed fallback in <FitnessImage>, so a removed photo degrades gracefully.
 */
export type SiteImage = { src: string; alt: string; credit: string; position?: string };

const unsplash = (id: string, w = 1600) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${w}&q=80`;

export const IMAGES = {
  hero: {
    src: unsplash("photo-1571019613454-1cb2f99b2d8b"),
    alt: "A trainer guiding a client through a strength exercise",
    credit: "Unsplash",
    position: "center 35%",
  },
  community: {
    src: unsplash("photo-1544367567-0f2fcb009e0b", 1200),
    alt: "A woman practising yoga outdoors in morning light",
    credit: "Unsplash",
  },
  trainer: {
    src: unsplash("photo-1517836357463-d25dfeac3438", 1200),
    alt: "A trainer preparing for a strength session",
    credit: "Unsplash",
  },
} satisfies Record<string, SiteImage>;
