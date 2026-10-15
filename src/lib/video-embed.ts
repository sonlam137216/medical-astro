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
