import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConsultation } from '../src/lib/consultation.ts';

const ctx = {
  sourcePath: '/',
  clientCountry: null,
  newId: () => '11111111-1111-4111-8111-111111111111',
};
const base = { name: 'Ann Lee', email: 'ann@example.com' };

function phoneOf(raw: Record<string, unknown>) {
  const r = validateConsultation({ ...base, ...raw }, ctx);
  return r.ok ? r.value.phone : r.errors.phone;
}

test('country code is joined to the number', () => {
  assert.equal(phoneOf({ phone_country: '+84', phone: '98 940 22 11' }), '+84 98 940 22 11');
});

test('a national leading zero is dropped', () => {
  assert.equal(phoneOf({ phone_country: '+84', phone: '0989402211' }), '+84 989402211');
});

test('a number typed with its own + prefix is kept as typed', () => {
  assert.equal(phoneOf({ phone_country: '+84', phone: '+61 400 111 222' }), '+61 400 111 222');
});

test('without a country code the old behaviour still applies', () => {
  assert.equal(phoneOf({ phone: '+84 98 940 22 11' }), '+84 98 940 22 11');
  assert.match(String(phoneOf({ phone: '12' })), /valid phone/);
});

test('an invalid country code is rejected, not stored', () => {
  assert.match(String(phoneOf({ phone_country: '84; drop', phone: '989402211' })), /country code/);
  assert.match(String(phoneOf({ phone_country: '+84', phone: '' })), /enter your phone/);
});
