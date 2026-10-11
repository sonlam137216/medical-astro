// The media library as the pickers show it: a flat list of items that can be searched and shown a page at a time.
// Pure code (no imports) so it is unit-tested with `node --test` and shared by the endpoint and the browser.

export interface MediaItem {
  id: string;
  kind: 'image' | 'video';
  /** Small picture to show; a video without a cover image has none. */
  thumb: string | null;
  /** The description, or a note that there is none yet. */
  label: string;
  /** Extra line: the size of a video. */
  detail: string | null;
}

export const MEDIA_PAGE_SIZE = 24;

/** Items whose description contains every word typed (case-insensitive). No words: everything. */
export function searchMedia<T extends { label: string }>(items: T[], query: string): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length === 0
    ? items
    : items.filter((item) => words.every((w) => item.label.toLowerCase().includes(w)));
}

/** One page (1-based) and whether more follow. Out-of-range pages are empty rather than an error. */
export function pageMedia<T>(items: T[], page: number, size = MEDIA_PAGE_SIZE) {
  const current = Math.max(1, Math.floor(page) || 1);
  const from = (current - 1) * size;
  return { items: items.slice(from, from + size), more: items.length > from + size };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from a comma-separated query value; anything that is not an id is dropped; at most `max`. */
export function parseIds(raw: string | null | undefined, max = 40): string[] {
  return [
    ...new Set(
      (raw ?? '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter((s) => UUID.test(s)),
    ),
  ].slice(0, max);
}
