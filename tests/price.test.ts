import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tidyPrice } from '../src/lib/price.ts';

test('a dollar sign after the number moves in front of it', () => {
  assert.equal(tidyPrice('From 600$'), 'From $600');
  assert.equal(tidyPrice('TOTAL: 600$'), 'TOTAL: $600');
  assert.equal(tidyPrice('1,250 $ per tooth'), '$1,250 per tooth');
  assert.equal(tidyPrice('600$ – 900$'), '$600 – $900');
});

test('prices already written the English way stay as they are', () => {
  for (const text of [
    'From $600',
    'TOTAL: $1,000',
    'C$1,250',
    'A$1,250 | 40 clinics',
    'US$ 800',
    '',
  ]) {
    assert.equal(tidyPrice(text), text);
  }
});
