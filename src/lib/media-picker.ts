import type { AdminDb } from './admin-auth';
import { toFocus, type FocusPoint } from './image-slots';
import { mediaUrl, thumbnailKey } from './media';
import { MEDIA_PAGE_SIZE, pageMedia, searchMedia, type MediaItem } from './media-list';

export interface PickerImage {
  id: string;
  thumb: string;
  label: string;
  width: number | null;
  height: number | null;
  focus: FocusPoint | null;
}

/** Images offered in the photo picker of a form (newest first). */
export async function listPickerImages(db: AdminDb): Promise<PickerImage[]> {
  const { data } = await db
    .from('media_assets')
    .select('id, r2_key, alt_text, is_decorative, variant_widths, width, height, focal_x, focal_y')
    .eq('kind', 'image')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((a) => ({
    id: a.id,
    thumb: mediaUrl(thumbnailKey(a.r2_key, a.variant_widths)),
    label: a.is_decorative ? 'Decorative' : (a.alt_text ?? 'No description yet'),
    width: a.width,
    height: a.height,
    focus: toFocus(a.focal_x, a.focal_y),
  }));
}

/** Newest first; the library is small enough to read once and filter here (there is no LIKE in the query layer). */
const LIBRARY_LIMIT = 500;

/**
 * One page of the library for the pickers (`kind` images or videos), optionally searched; or, with `ids`, exactly
 * those items (used to draw pictures already placed in an article). Only active files.
 */
export async function listMedia(
  db: AdminDb,
  options: { kind: 'image' | 'video'; query?: string; page?: number; ids?: string[] },
): Promise<{ items: MediaItem[]; more: boolean }> {
  let query = db
    .from('media_assets')
    .select(
      'id, kind, r2_key, alt_text, is_decorative, variant_widths, size_bytes, poster_asset_id, width, height, focal_x, focal_y',
    )
    .eq('kind', options.kind)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  if (options.ids) query = query.in('id', options.ids.slice(0, 80));
  else query = query.limit(LIBRARY_LIMIT);
  const { data } = await query;
  const rows = data ?? [];

  // A video's picture is its cover image: look those up in one go.
  const posterIds = [
    ...new Set(rows.flatMap((r) => (r.poster_asset_id ? [r.poster_asset_id] : []))),
  ];
  const posters = new Map<string, string>();
  if (posterIds.length > 0) {
    const { data: found } = await db
      .from('media_assets')
      .select('id, r2_key, variant_widths')
      .in('id', posterIds.slice(0, 80));
    for (const p of found ?? [])
      posters.set(p.id, mediaUrl(thumbnailKey(p.r2_key, p.variant_widths)));
  }

  const all: MediaItem[] = rows.map((r) =>
    r.kind === 'video'
      ? {
          id: r.id,
          kind: 'video',
          thumb: r.poster_asset_id ? (posters.get(r.poster_asset_id) ?? null) : null,
          label: r.alt_text ?? 'No description yet',
          detail: `${(r.size_bytes / 1024 / 1024).toFixed(1)} MB`,
          width: null,
          height: null,
          focus: null,
        }
      : {
          id: r.id,
          kind: 'image',
          thumb: mediaUrl(thumbnailKey(r.r2_key, r.variant_widths)),
          label: r.is_decorative ? 'Decorative' : (r.alt_text ?? 'No description yet'),
          detail: r.width && r.height ? `${r.width} × ${r.height} px` : null,
          width: r.width,
          height: r.height,
          focus: toFocus(r.focal_x, r.focal_y),
        },
  );
  if (options.ids) return { items: all, more: false };
  return pageMedia(searchMedia(all, options.query ?? ''), options.page ?? 1, MEDIA_PAGE_SIZE);
}
