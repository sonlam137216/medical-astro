// Advice about a video before it is uploaded. Videos are stored exactly as sent (no conversion), so the editor's
// file is what visitors download: these checks say when it is heavier than a web page needs. Advice only, nothing
// is blocked (the hard limits are in src/lib/media.ts and src/lib/mp4.ts). Pure code, used in the browser.

/** The one-line recommendation shown with every video upload. */
export const VIDEO_SPEC_HINT =
  'Best: MP4 (H.264 video, AAC sound), 1280 × 720 pixels (1920 × 1080 at most), about 2 to 4 Mbps, under 80 MB.';

export interface VideoFacts {
  width: number | null;
  height: number | null;
  /** Seconds. */
  duration: number | null;
  bytes: number;
}

const MBPS_LIMIT = 6;

/** Average bit rate in megabits per second, or null when the length is unknown. */
export function bitrateMbps(bytes: number, duration: number | null): number | null {
  return duration && duration > 0 ? (bytes * 8) / duration / 1_000_000 : null;
}

export function videoWarnings(facts: VideoFacts): string[] {
  const warnings: string[] = [];
  const { width, height } = facts;
  if (width && height && Math.max(width, height) > 1920) {
    warnings.push(
      `This video is ${width} × ${height} pixels. A web page never shows it that large: 1280 × 720 (or 1920 × 1080) is plenty and loads much faster.`,
    );
  }
  const rate = bitrateMbps(facts.bytes, facts.duration);
  if (rate !== null && rate > MBPS_LIMIT) {
    warnings.push(
      `This video uses about ${rate.toFixed(1)} Mbps. For a web page 2 to 4 Mbps looks the same, and visitors on a slow connection will wait much less.`,
    );
  }
  if (width && height && width < height) {
    warnings.push(
      'This is a portrait video: it will be shown tall, taller than the picture beside it.',
    );
  }
  return warnings;
}

/** True when a cover image has noticeably different proportions from its video (5 % tolerance). */
export function coverMismatch(
  video: { width: number | null; height: number | null },
  cover: { width: number | null; height: number | null },
): boolean {
  if (!video.width || !video.height || !cover.width || !cover.height) return false;
  const a = video.width / video.height;
  const b = cover.width / cover.height;
  return Math.abs(a - b) / a > 0.05;
}
