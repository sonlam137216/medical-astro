import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl } from '../src/lib/video-embed.ts';
import { createDb } from '../src/lib/db.ts';
import { buildSnapshot, isSnapshot } from '../src/lib/snapshot.ts';
import { testDb } from './helpers/sqlite.ts';

test('YouTube links in every common shape become the same player', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?v=${id}&t=30s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/live/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `  https://www.youtube.com/watch?v=${id}  `,
  ]) {
    const v = parseVideoUrl(url);
    assert.ok(v, url);
    assert.equal(v.provider, 'youtube');
    assert.equal(v.embedUrl, `https://www.youtube-nocookie.com/embed/${id}`);
    assert.equal(v.watchUrl, `https://www.youtube.com/watch?v=${id}`);
  }
});

test('Vimeo links become the Vimeo player', () => {
  for (const url of [
    'https://vimeo.com/123456789',
    'https://player.vimeo.com/video/123456789?h=x',
  ]) {
    const v = parseVideoUrl(url);
    assert.equal(v?.provider, 'vimeo');
    assert.equal(v?.embedUrl, 'https://player.vimeo.com/video/123456789');
    assert.equal(v?.watchUrl, 'https://vimeo.com/123456789');
  }
});

test('anything else is refused: other hosts, plain http, look-alike hosts, odd ids', () => {
  for (const url of [
    '',
    '   ',
    null,
    undefined,
    'not a link',
    'http://www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
    'https://evilyoutube.com/watch?v=dQw4w9WgXcQ',
    'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v="><script>',
    'https://www.youtube.com/',
    'https://youtu.be/',
    'https://vimeo.com/channels/staffpicks',
    'https://vimeo.com/12',
    'javascript:alert(1)',
    'https://www.facebook.com/video/123456789',
  ]) {
    assert.equal(parseVideoUrl(url), null, String(url));
  }
});

test('the video link reaches the snapshot only when it is a valid link', async () => {
  const { raw, sql } = testDb();
  const db = createDb(sql, { actorId: 'admin-1', audit: true });
  raw
    .prepare('INSERT INTO site_settings (id, site_name, intro_video_url) VALUES (1, ?, ?)')
    .run('Melatec', 'https://youtu.be/dQw4w9WgXcQ');
  const snapshot = await buildSnapshot(db);
  assert.equal(snapshot.site?.videoUrl, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  assert.ok(isSnapshot(snapshot));

  raw.prepare('UPDATE site_settings SET intro_video_url = NULL WHERE id = 1').run();
  const without = await buildSnapshot(db);
  assert.equal('videoUrl' in (without.site ?? {}), false);

  // A bad address cannot be stored at all (the CHECK), and a hand-edited snapshot with one is not accepted.
  assert.throws(() =>
    raw
      .prepare("UPDATE site_settings SET intro_video_url = 'http://x.example/v' WHERE id = 1")
      .run(),
  );
  assert.equal(
    isSnapshot({ ...without, site: { ...without.site, videoUrl: 'https://example.com/x' } }),
    false,
  );
});
