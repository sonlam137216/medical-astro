import { allVariantKeys, isServableKey } from './media.ts';

// Finds the files in the media bucket that nothing uses any more: pictures replaced by a newer version, and files
// left behind by an upload that failed half way. Pure code (the bucket listing and the database rows are passed
// in) so the rules are unit-tested.

export interface StoredObject {
  key: string;
  size: number;
  /** When the file was written (milliseconds since 1970). */
  uploaded: number;
}

export interface CleanupAsset {
  r2_key: string;
  kind: string;
  variant_widths: number[];
}

export interface CleanupPlan {
  /** Unused and old enough to delete. */
  remove: StoredObject[];
  /** Unused but young: kept for now (see CLEANUP_GRACE_DAYS). */
  recent: StoredObject[];
  /** Files in use, and files this system did not write (never touched). */
  kept: number;
  /** Total size of `remove`. */
  bytes: number;
}

/**
 * An unused file is kept this long. The live website was built from an earlier Publish and may still point at the
 * previous version of a replaced picture until the next deploy, and an older revision can be built again; a file
 * that is being uploaded has no row yet either.
 */
export const CLEANUP_GRACE_DAYS = 30;

export function planCleanup(
  objects: StoredObject[],
  assets: CleanupAsset[],
  now: number,
  graceDays = CLEANUP_GRACE_DAYS,
): CleanupPlan {
  const live = new Set<string>();
  for (const asset of assets) {
    const keys =
      asset.kind === 'image' ? allVariantKeys(asset.r2_key, asset.variant_widths) : [asset.r2_key];
    for (const key of keys) live.add(key);
  }
  const limit = now - graceDays * 24 * 60 * 60 * 1000;
  const plan: CleanupPlan = { remove: [], recent: [], kept: 0, bytes: 0 };
  for (const object of objects) {
    // Only files named the way this system names them can be judged; anything else is left alone.
    if (live.has(object.key) || !isServableKey(object.key)) {
      plan.kept++;
    } else if (object.uploaded > limit) {
      plan.recent.push(object);
    } else {
      plan.remove.push(object);
      plan.bytes += object.size;
    }
  }
  return plan;
}
