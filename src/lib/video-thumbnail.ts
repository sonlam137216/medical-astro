import {
  vimeoThumbnail,
  youtubeThumbnails,
  type VideoEmbed,
  type VideoThumbnail,
} from './video-embed.ts';

// Finds the cover of a YouTube or Vimeo video while the website is built. The picture itself is then downloaded
// and turned into WebP by Astro (remote images, `image.domains` in astro.config.mjs), so visitors load it from
// this site and nothing of YouTube or Vimeo is requested before they press play. A cover that cannot be found
// (no network, a private or removed video) is not an error: the caller shows the section's own picture instead.

const TIMEOUT_MS = 8000;
const found = new Map<string, Promise<VideoThumbnail | null>>();

export function findThumbnail(
  video: VideoEmbed,
  fetcher: typeof fetch = fetch,
): Promise<VideoThumbnail | null> {
  const key = `${video.provider}:${video.id}`;
  let result = found.get(key);
  if (!result) {
    result = (
      video.provider === 'youtube' ? youtube(video.id, fetcher) : vimeo(video, fetcher)
    ).catch(() => null);
    if (fetcher === fetch) found.set(key, result);
  }
  return result;
}

async function youtube(id: string, fetcher: typeof fetch): Promise<VideoThumbnail | null> {
  // A size the video does not have answers 404 (with a grey placeholder picture as the body).
  for (const candidate of youtubeThumbnails(id)) {
    const res = await fetcher(candidate.url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    await res.body?.cancel();
    if (res.ok) return candidate;
  }
  return null;
}

async function vimeo(video: VideoEmbed, fetcher: typeof fetch): Promise<VideoThumbnail | null> {
  const url = `https://vimeo.com/api/oembed.json?width=1280&url=${encodeURIComponent(video.watchUrl)}`;
  const res = await fetcher(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) {
    await res.body?.cancel();
    return null;
  }
  return vimeoThumbnail(await res.json());
}
