import { test } from 'node:test';
import assert from 'node:assert';
import { checkPin, isWeakPin, lockoutMs, makePinRecord } from '../src/core/appPin';

test('el código se verifica por huella, sin guardarlo', () => {
  const rec = makePinRecord('2580', 'ab'.repeat(16));
  assert.ok(!JSON.stringify(rec).includes('2580'));
  assert.ok(checkPin('2580', rec));
  assert.ok(!checkPin('2581', rec));
  assert.ok(!checkPin('258', rec));
  // otra sal → otra huella
  assert.notStrictEqual(makePinRecord('2580', 'cd'.repeat(16)).hash, rec.hash);
});

test('códigos obvios y espera tras errores', () => {
  for (const p of ['1111', '1234', '4321', '0123', '9876']) assert.ok(isWeakPin(p), p);
  for (const p of ['2580', '1357', '7391']) assert.ok(!isWeakPin(p), p);
  assert.strictEqual(lockoutMs(4), 0);
  assert.strictEqual(lockoutMs(5), 30_000);
  assert.strictEqual(lockoutMs(50), 3_600_000);
});
