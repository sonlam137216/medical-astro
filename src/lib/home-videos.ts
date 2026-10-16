import { parseVideoUrl } from './video-embed';
import { findThumbnail } from './video-thumbnail';

/**
 * The video list of the Home "dentists & patients" section (Page text) -> what the page draws: each link as a
 * player address, with its cover from YouTube or Vimeo when one is found. A link that is not a YouTube or Vimeo
 * video is left out (Publish already refuses one, so this only guards older or hand-made data).
 */
export async function getHomeVideos(list: readonly { url: string; title: string }[] | undefined) {
  const videos = (list ?? []).flatMap((v) => {
    const embed = parseVideoUrl(v.url);
    return embed ? [{ embed, title: v.title?.trim() ?? '' }] : [];
  });
  return Promise.all(videos.map(async (v) => ({ ...v, thumbnail: await findThumbnail(v.embed) })));
}
