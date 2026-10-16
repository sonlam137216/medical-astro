import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sectionByKey } from '../src/lib/cms/sections.ts';
import { itemInput, parseFields } from '../src/lib/cms/fields.ts';
import { parseVideoUrl, vimeoThumbnail, youtubeThumbnails } from '../src/lib/video-embed.ts';
import { findThumbnail } from '../src/lib/video-thumbnail.ts';

const fields = sectionByKey('home_conversations')!.fields.filter((f) => f.type !== 'image');
const form = (entries: Record<string, string>) =>
  new URLSearchParams({ label: 'L', title: 'T', ...entries });

test('home videos: YouTube and Vimeo links are kept in order, empty slots dropped', () => {
  const parsed = parseFields(
    fields,
    form({
      [itemInput('videos', 0, 'url')]: ' https://youtu.be/dQw4w9WgXcQ ',
      [itemInput('videos', 0, 'title')]: 'Meet Dr. A',
      [itemInput('videos', 2, 'url')]: 'https://vimeo.com/76979871',
    }),
  );
  assert.ok(parsed.ok);
  assert.deepEqual(parsed.value.videos, [
    { url: 'https://youtu.be/dQw4w9WgXcQ', title: 'Meet Dr. A' },
    { url: 'https://vimeo.com/76979871', title: '' },
  ]);
});

test('home videos: any other link, or a title without a link, is refused', () => {
  for (const url of ['https://example.com/video', 'http://youtu.be/dQw4w9WgXcQ', 'not a link']) {
    const parsed = parseFields(fields, form({ [itemInput('videos', 0, 'url')]: url }));
    assert.equal(parsed.ok, false, url);
    if (!parsed.ok) assert.match(parsed.errors.videos, /YouTube or Vimeo/);
  }
  const noLink = parseFields(fields, form({ [itemInput('videos', 0, 'title')]: 'Title only' }));
  assert.equal(noLink.ok, false);
  if (!noLink.ok) assert.match(noLink.errors.videos, /please fill in/);
});

const embed = parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')!;
const answer = (status: number, body: unknown = '') =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });

test('YouTube cover: the largest size the video has', async () => {
  const asked: string[] = [];
  const fetcher = (async (url: string) => {
    asked.push(url);
    return answer(url.includes('maxres') ? 404 : 200);
  }) as typeof fetch;
  const thumb = await findThumbnail(embed, fetcher);
  assert.deepEqual(thumb, youtubeThumbnails(embed.id)[1]);
  assert.equal(asked.length, 2);
});

test('YouTube cover: none found, or no network, is not an error', async () => {
  assert.equal(await findThumbnail(embed, (async () => answer(404)) as typeof fetch), null);
  const offline = (async () => {
    throw new TypeError('fetch failed');
  }) as typeof fetch;
  assert.equal(await findThumbnail(embed, offline), null);
});

test('Vimeo cover: taken from oEmbed, only from the Vimeo image host', async () => {
  const vimeo = parseVideoUrl('https://vimeo.com/76979871')!;
  const good = {
    thumbnail_url: 'https://i.vimeocdn.com/video/1.jpg',
    thumbnail_width: 1280,
    thumbnail_height: 720,
  };
  assert.deepEqual(await findThumbnail(vimeo, (async () => answer(200, good)) as typeof fetch), {
    url: good.thumbnail_url,
    width: 1280,
    height: 720,
  });
  assert.equal(vimeoThumbnail({ ...good, thumbnail_url: 'https://evil.example/1.jpg' }), null);
  assert.equal(vimeoThumbnail({ ...good, thumbnail_width: '1280' }), null);
  assert.equal(await findThumbnail(vimeo, (async () => answer(404)) as typeof fetch), null);
});
