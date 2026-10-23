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
    // Vitaly Gariev, Unsplash: a trainer coaching a client through a barbell lift in a bright studio.
    src: unsplash("photo-1758875569256-f37c438cac65", 2000),
    alt: "A personal trainer watching a client perform a barbell deadlift in a bright studio",
    credit: "Vitaly Gariev / Unsplash",
    position: "55% 40%",
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
