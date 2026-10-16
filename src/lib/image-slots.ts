// Every place on the website that shows a picture chosen in the admin, with the frame the picture is cropped to.
// The public components read the frame from here (ProfileImage `slot`), and the admin reads the same entry to say
// which size to upload and to preview the crop, so what the editor is told is what visitors get. Pure code: no
// imports, safe in the build, the Worker and the browser.

export interface SlotFrame {
  /** Where this frame appears, in words an editor knows. */
  label: string;
  /** Size of the frame on a desktop screen, in CSS pixels. Only the proportions and the width matter. */
  width: number;
  height: number;
}

export interface ImageSlot {
  label: string;
  /** The first frame is the main one; more frames mean the same picture is cropped differently elsewhere. */
  frames: readonly [SlotFrame, ...SlotFrame[]];
  /** Part of the picture kept in view (percent from the top-left) when no focus point was chosen. */
  position: { x: number; y: number };
}

export const IMAGE_SLOTS = {
  'service-card': {
    label: 'Service card',
    frames: [{ label: 'Service cards', width: 384, height: 190 }],
    position: { x: 50, y: 0 },
  },
  // The top banner of every page but Home (Pages, and each service's page): full width, one height on every page
  // (--page-hero-height in tokens.css), the title and text over the left part (a white fade).
  'page-banner': {
    label: 'Page banner',
    frames: [{ label: 'Top of the page', width: 1440, height: 480 }],
    position: { x: 75, y: 50 },
  },
  // The first screen of the Home page: taller than the other banners (560–700 px high, 662 px on a 1440 px
  // screen), the title and text over the left part.
  'home-hero': {
    label: 'Home page banner',
    frames: [{ label: 'First screen of the Home page', width: 1440, height: 662 }],
    position: { x: 70, y: 50 },
  },
  'package-card': {
    label: 'Package card',
    frames: [{ label: 'Package cards', width: 384, height: 190 }],
    position: { x: 50, y: 0 },
  },
  'location-card': {
    label: 'Clinic or destination card',
    frames: [{ label: 'Clinic and Discover Vietnam cards', width: 384, height: 216 }],
    position: { x: 50, y: 50 },
  },
  doctor: {
    label: 'Doctor photo',
    frames: [
      { label: 'Our Doctors page', width: 282, height: 422 },
      { label: 'Doctor cards', width: 282, height: 280 },
    ],
    // Faces sit in the upper part of a portrait.
    position: { x: 50, y: 20 },
  },
  'article-cover': {
    label: 'Article cover',
    frames: [{ label: 'Article page, lists and cards', width: 680, height: 453 }],
    position: { x: 50, y: 50 },
  },
  'home-conversations': {
    label: 'Home picture',
    frames: [{ label: 'Home page, beside the text', width: 520, height: 440 }],
    position: { x: 50, y: 50 },
  },
  share: {
    label: 'Share picture',
    // Shown when the page is shared (chat apps, social networks): the usual 1.91:1 preview, cropped to the middle.
    frames: [{ label: 'Link preview when the page is shared', width: 600, height: 315 }],
    position: { x: 50, y: 50 },
  },
  'home-smile': {
    label: 'Before / after photo',
    frames: [{ label: 'Home page slider', width: 560, height: 440 }],
    position: { x: 50, y: 50 },
  },
  // One card of the before/after slider on the service pages (Smile results): both pictures fill the same frame.
  'smile-result': {
    label: 'Before / after card',
    frames: [{ label: 'Service pages, results slider', width: 448, height: 318 }],
    position: { x: 50, y: 40 },
  },
} as const satisfies Record<string, ImageSlot>;

export type SlotKey = keyof typeof IMAGE_SLOTS;

export function isSlotKey(value: unknown): value is SlotKey {
  return typeof value === 'string' && Object.hasOwn(IMAGE_SLOTS, value);
}

export const slotOf = (key: SlotKey): ImageSlot => IMAGE_SLOTS[key];

/** Proportions of the main frame (width / height). */
export const slotRatio = (slot: ImageSlot) => slot.frames[0].width / slot.frames[0].height;

const COMMON_RATIOS: ReadonlyArray<readonly [string, number]> = [
  ['1:1', 1],
  ['4:3', 4 / 3],
  ['3:2', 3 / 2],
  ['16:9', 16 / 9],
  ['2:1', 2],
  ['3:4', 3 / 4],
  ['2:3', 2 / 3],
  ['5:4', 5 / 4],
];

/** "3:2" for a ratio close to a common one, otherwise "1.27:1". */
export function ratioLabel(ratio: number): string {
  for (const [name, value] of COMMON_RATIOS) {
    if (Math.abs(ratio - value) / value < 0.04) return name;
  }
  return ratio >= 1 ? `${ratio.toFixed(2)}:1` : `1:${(1 / ratio).toFixed(2)}`;
}

/** Sizes the browser makes are 480, 960 and 1600 px wide (src/lib/media.ts), so ask for one of those. */
export function recommendedSize(slot: ImageSlot): { width: number; height: number } {
  const widest = Math.max(...slot.frames.map((f) => f.width));
  // Twice the frame width keeps the picture sharp on high-density screens.
  const width = widest * 2 <= 960 ? 960 : 1600;
  return { width, height: Math.round(width / slotRatio(slot)) };
}

/**
 * Below this width the picture looks soft even on an ordinary screen. Never more than 1200 px: the widest file made
 * at upload is 1600 px, so a full-width banner cannot ask for more than that anyway.
 */
export function minimumWidth(slot: ImageSlot): number {
  const widest = Math.max(...slot.frames.map((f) => f.width));
  return Math.min(Math.round((widest * 1.5) / 10) * 10, 1200);
}

export interface FitReport {
  /** Share (0-100) of the picture cut off in the worst frame. */
  cropPercent: number;
  /** Which edges are cut in that frame. */
  cropped: 'sides' | 'top and bottom' | null;
  /** Narrower than the sharpness limit. */
  small: boolean;
}

/** How a picture of the given size fits the slot's frames (the worst frame counts). */
export function fitReport(slot: ImageSlot, size: { width: number; height: number }): FitReport {
  const ratio = size.width / size.height;
  let cropPercent = 0;
  let cropped: FitReport['cropped'] = null;
  for (const frame of slot.frames) {
    const target = frame.width / frame.height;
    const share = ratio > target ? 1 - target / ratio : 1 - ratio / target;
    const percent = Math.round(share * 100);
    if (percent > cropPercent) {
      cropPercent = percent;
      cropped = ratio > target ? 'sides' : 'top and bottom';
    }
  }
  return { cropPercent, cropped, small: size.width < minimumWidth(slot) };
}

/** From this share on the crop is worth a warning. */
export const CROP_WARNING_PERCENT = 15;

/** The one-line recommendation shown with a picture field. */
export function slotHint(slot: ImageSlot): string {
  const { width, height } = recommendedSize(slot);
  const where = slot.frames.map((f) => f.label).join('; ');
  const ratio = ratioLabel(slotRatio(slot));
  return `Shown as ${ratio} (${where}). Best: about ${width} × ${height} px; at least ${minimumWidth(slot)} px wide.`;
}

/** Warnings for a picture in a slot; empty when it fits. Advice only: nothing is blocked. */
export function fitWarnings(slot: ImageSlot, size: { width: number; height: number }): string[] {
  const report = fitReport(slot, size);
  const warnings: string[] = [];
  if (report.cropped && report.cropPercent >= CROP_WARNING_PERCENT) {
    warnings.push(
      `About ${report.cropPercent}% of the picture will be cut off at the ${report.cropped}. Use “Choose what stays in view” to pick the part that must remain visible.`,
    );
  }
  if (report.small) {
    warnings.push(
      `The picture is ${size.width} px wide: it may look blurry here. Use one at least ${minimumWidth(slot)} px wide.`,
    );
  }
  return warnings;
}

export interface FocusPoint {
  x: number;
  y: number;
}

/** A valid focus point (whole percent 0-100 on both axes) or null. */
export function toFocus(x: unknown, y: unknown): FocusPoint | null {
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
  return x >= 0 && x <= 100 && y >= 0 && y <= 100 ? { x, y } : null;
}

/** `aspect-ratio` value of a frame, e.g. "384 / 190". */
export function frameAspect(slot: ImageSlot, frame = 0): string {
  const { width, height } = slot.frames[frame] ?? slot.frames[0];
  return `${width} / ${height}`;
}

/** The CSS that crops a picture to one of the slot's frames (the main one by default), keeping the focus point (or the slot's default) in view. */
export function frameStyle(slot: ImageSlot, focus?: FocusPoint | null, frame = 0): string {
  const point = focus ?? slot.position;
  return `aspect-ratio: ${frameAspect(slot, frame)}; object-fit: cover; object-position: ${point.x}% ${point.y}%`;
}
