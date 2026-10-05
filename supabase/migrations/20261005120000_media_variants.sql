-- Media variants. An image is stored in R2 as several WebP files of different widths (R2 does not resize).
-- `r2_key` stays the key of the largest file; the others live next to it as '<prefix>/<width>.webp',
-- and `variant_widths` lists every width that exists (largest included), ascending.
alter table public.media_assets
  add column variant_widths integer[] not null default '{}'
  check (
    cardinality(variant_widths) <= 8
    and 0 < all (variant_widths)
  );

comment on column public.media_assets.variant_widths is
  'Pixel widths of the WebP files stored for this image, ascending. Empty for non-image assets.';
