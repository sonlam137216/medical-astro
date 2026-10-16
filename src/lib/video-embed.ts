/**
 * Video links the admin may paste for the Home page video: YouTube and Vimeo only (the page loads the player of
 * exactly these two hosts, see `frame-src` in astro.config.mjs). `parseVideoUrl` turns a pasted address into the
 * provider, the embed address and the plain watch address, or null when it is not a link of one of them.
 */
export interface VideoEmbed {
  provider: 'youtube' | 'vimeo';
  id: string;
  /** The player page used inside an iframe (YouTube without cookies). */
  embedUrl: string;
  /** The normal page of the video: the link shown when JavaScript is off. */
  watchUrl: string;
}

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{5,12}$/;
const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
]);

export function parseVideoUrl(input: string | null | undefined): VideoEmbed | null {
  const text = (input ?? '').trim();
  if (!text || text.length > 300) return null;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  let youtubeId: string | null = null;
  if (host === 'youtu.be') youtubeId = parts[0] ?? null;
  else if (YOUTUBE_HOSTS.has(host)) {
    if (parts[0] === 'watch') youtubeId = url.searchParams.get('v');
    else if (['embed', 'shorts', 'live', 'v'].includes(parts[0] ?? ''))
      youtubeId = parts[1] ?? null;
  } else if (host === 'www.youtube-nocookie.com' && parts[0] === 'embed')
    youtubeId = parts[1] ?? null;
  if (youtubeId && YOUTUBE_ID.test(youtubeId)) {
    return {
      provider: 'youtube',
      id: youtubeId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
      watchUrl: `https://www.youtube.com/watch?v=${youtubeId}`,
    };
  }

  let vimeoId: string | null = null;
  if (host === 'vimeo.com' || host === 'www.vimeo.com') vimeoId = parts[0] ?? null;
  else if (host === 'player.vimeo.com' && parts[0] === 'video') vimeoId = parts[1] ?? null;
  if (vimeoId && VIMEO_ID.test(vimeoId)) {
    return {
      provider: 'vimeo',
      id: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}`,
      watchUrl: `https://vimeo.com/${vimeoId}`,
    };
  }
  return null;
}

/** A video's cover picture on the provider's image host, with its size. */
export interface VideoThumbnail {
  url: string;
  width: number;
  height: number;
}

/**
 * The covers YouTube may have for a video, largest first: `maxresdefault` exists only for HD uploads and
 * `sddefault` not for every old video, `hqdefault` always does (both of those are 4:3 with black bars, which the
 * 16:9 frame crops away). Vimeo has no fixed address: its cover comes from oEmbed (see video-thumbnail.ts).
 */
export function youtubeThumbnails(id: string): VideoThumbnail[] {
  return [
    { url: `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`, width: 1280, height: 720 },
    { url: `https://i.ytimg.com/vi/${id}/sddefault.jpg`, width: 640, height: 480 },
    { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, width: 480, height: 360 },
  ];
}

/** Image hosts the build may download covers from (`image.domains` in astro.config.mjs). */
export const THUMBNAIL_HOSTS = ['i.ytimg.com', 'i.vimeocdn.com'] as const;

/** The oEmbed answer of Vimeo -> its cover, or null when it has none on an allowed host. */
export function vimeoThumbnail(data: unknown): VideoThumbnail | null {
  if (typeof data !== 'object' || data === null) return null;
  const {
    thumbnail_url: url,
    thumbnail_width: width,
    thumbnail_height: height,
  } = data as Record<string, unknown>;
  if (typeof url !== 'string' || typeof width !== 'number' || typeof height !== 'number')
    return null;
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !(THUMBNAIL_HOSTS as readonly string[]).includes(u.hostname))
      return null;
  } catch {
    return null;
  }
  return width > 0 && height > 0 ? { url, width, height } : null;
}
