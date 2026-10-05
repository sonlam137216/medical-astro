import type { AdminDb } from './admin-auth';
import { mediaUrl, thumbnailKey } from './media';

export interface PickerImage {
  id: string;
  thumb: string;
  label: string;
}

/** Images offered in the photo picker of a form (newest first). */
export async function listPickerImages(db: AdminDb): Promise<PickerImage[]> {
  const { data } = await db
    .from('media_assets')
    .select('id, r2_key, alt_text, is_decorative, variant_widths')
    .eq('kind', 'image')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(100);
  return (data ?? []).map((a) => ({
    id: a.id,
    thumb: mediaUrl(thumbnailKey(a.r2_key, a.variant_widths)),
    label: a.is_decorative ? 'Decorative' : (a.alt_text ?? 'No description yet'),
  }));
}
