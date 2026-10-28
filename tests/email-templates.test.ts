import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEmailDate,
  consultationEmail,
  testEmail,
  verificationEmail,
} from '../src/lib/email-templates.ts';

const origin = 'https://melatecdentalclinic.com';
const receivedAt = '2026-10-28T07:18:42.415Z';
const id = '11111111-1111-4111-8111-111111111111';

test('email dates always use Vietnam time, including midnight, day and year rollovers', () => {
  assert.equal(formatEmailDate(receivedAt), '28/10/2026 · 14:18');
  assert.equal(formatEmailDate('2026-10-28T17:05:00Z'), '29/10/2026 · 00:05');
  assert.equal(formatEmailDate('2026-12-31T18:30:00Z'), '01/01/2027 · 01:30');
  assert.equal(formatEmailDate('2026-10-28T14:18:42.415+07:00'), '28/10/2026 · 14:18');
  assert.equal(formatEmailDate(Date.parse(receivedAt)), '28/10/2026 · 14:18');
  assert.equal(formatEmailDate('invalid'), '—');
});

test('all email types include HTML, a text fallback and explicit Vietnam time without external assets', () => {
  for (const mail of [
    consultationEmail(origin, id, receivedAt),
    testEmail(origin, receivedAt),
    verificationEmail(origin, 'a'.repeat(64), Date.parse(receivedAt)),
  ]) {
    assert.match(mail.html, /<!doctype html>/);
    assert.match(mail.html, /role="presentation"/);
    assert.match(mail.html, /Melatec/);
    assert.match(mail.html, /28\/10\/2026 · 14:18/);
    assert.match(mail.text, /28\/10\/2026 · 14:18/);
    assert.match(mail.text, /Vietnam time \(UTC\+7\)/);
    assert.doesNotMatch(mail.html, /<script|<img|<iframe|<link|@import|url\(/i);
    assert.doesNotMatch(mail.text + mail.html, /2026-10-28T07:18|\(UTC\)/);
  }
});

test('consultation email has a clear request link and no additional patient fields', () => {
  const mail = consultationEmail(origin, id, receivedAt);
  const url = `${origin}/admin/consultations/${id}`;
  assert.ok(mail.text.includes(url));
  assert.ok(mail.html.includes(`href="${url}"`));
  assert.match(mail.html, /View consultation request/);
  assert.match(mail.text, /Request received/);
  assert.doesNotMatch(mail.html, /mailto:|tel:|full_name|service_interest|client_country/);
});

test('HTML escapes dynamic values and encodes identifiers in action URLs', () => {
  const maliciousId = '"><img src=x onerror=alert(1)>&';
  const mail = consultationEmail(origin, maliciousId, receivedAt);
  assert.doesNotMatch(mail.html, /<img/);
  assert.ok(mail.html.includes('&lt;img'));
  assert.ok(mail.html.includes(encodeURIComponent(maliciousId)));
  const verification = verificationEmail(origin, '"><script>', Date.parse(receivedAt));
  assert.doesNotMatch(verification.html, /<script/);
  assert.ok(verification.html.includes('#token=%22%3E%3Cscript%3E'));
});

test('verification retains the fragment token link and test CTA opens email settings', () => {
  const token = 'a'.repeat(64);
  const mail = verificationEmail(origin, token, Date.parse(receivedAt));
  assert.ok(mail.html.includes(`href="${origin}/admin/email/confirm#token=${token}"`));
  assert.ok(mail.text.includes(`${origin}/admin/email/confirm#token=${token}`));
  assert.doesNotMatch(mail.html + mail.text, /confirm\?token=/);
  assert.match(mail.text, /Link expires/);
  assert.ok(testEmail(origin, receivedAt).html.includes(`href="${origin}/admin/email"`));
});
