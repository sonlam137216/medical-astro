import type { ImageMetadata } from 'astro';

/** An image reference plus its alt text. Becomes a media_assets row once the CMS exists. */
export interface Img {
  src: ImageMetadata;
  alt: string;
}
