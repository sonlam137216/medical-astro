import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDoctorForm, slugify } from '../src/lib/doctors.ts';

const form = (o: Record<string, string>) => new URLSearchParams(o);
const errorsOf = (o: Record<string, string>) =>
  (parseDoctorForm(form(o)) as { errors?: Record<string, string> }).errors ?? {};

test('slugify', () => {
  assert.equal(slugify('Dr. Lê Thị Yến Đặng'), 'dr-le-thi-yen-dang');
  assert.equal(slugify('  --Hello,   World!!  '), 'hello-world');
  assert.equal(slugify('???'), '');
});

test('valid doctor is normalised', () => {
  const r = parseDoctorForm(
    form({
      full_name: '  Dr.  Le   Thi Yen ',
      credentials: 'A\n\n  B  \r\nC',
      languages: 'English, Vietnamese,english, English',
      sort_order: '3',
      is_visible: 'on',
      bio: 'Line1\r\nLine2',
    }),
  );
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.full_name, 'Dr. Le Thi Yen');
  assert.equal(r.value.slug, 'dr-le-thi-yen');
  assert.deepEqual(r.value.credentials, ['A', 'B', 'C']);
  assert.deepEqual(r.value.languages, ['English', 'Vietnamese', 'english']);
  assert.equal(r.value.bio, 'Line1\nLine2');
  assert.equal(r.value.role_title, null);
  assert.equal(r.value.image_id, null);
});

test('hidden by default and English by default', () => {
  const r = parseDoctorForm(form({ full_name: 'X' }));
  assert.equal(r.ok && r.value.is_visible, false);
  assert.deepEqual(r.ok && r.value.languages, ['English']);
});

test('validation errors', () => {
  assert.ok(errorsOf({ full_name: '   ' }).full_name);
  assert.ok(errorsOf({ full_name: 'X', slug: 'Bad Slug!' }).slug);
  assert.ok(errorsOf({ full_name: 'X', sort_order: '-1' }).sort_order);
  assert.ok(errorsOf({ full_name: 'X', sort_order: '1.5' }).sort_order);
  assert.ok(errorsOf({ full_name: 'X', credentials: Array(21).fill('a').join('\n') }).credentials);
  assert.ok(errorsOf({ full_name: 'X', bio: 'a'.repeat(4001) }).bio);
  assert.ok(errorsOf({ full_name: 'X', image_id: 'not-a-uuid' }).image_id);
});
