import { test } from 'node:test';
import assert from 'node:assert';
import { backupState, configFingerprint, needsReview } from '../src/core/reminder';

const DAY = 86400000;
const now = Date.UTC(2026, 9, 13);

test('pide la confirmación la primera vez y cada 30 días', () => {
  assert.strictEqual(needsReview({}, now), true);
  assert.strictEqual(needsReview({ reviewedAt: now - 29 * DAY }, now), false);
  assert.strictEqual(needsReview({ reviewedAt: now - 30 * DAY }, now), true);
});

test('la huella cambia cuando cambia la configuración', () => {
  const a = { accounts: [{ address: 'r1', label: 'A' }], devices: [], contacts: [] };
  const b = { accounts: [{ address: 'r1', label: 'B' }], devices: [], contacts: [] };
  assert.strictEqual(configFingerprint(a), configFingerprint({ ...a }));
  assert.notStrictEqual(configFingerprint(a), configFingerprint(b));
});

test('estado del respaldo', () => {
  const fp = 'x';
  assert.deepStrictEqual(backupState({}, { fingerprint: fp, empty: true }, now), { kind: 'empty' });
  assert.deepStrictEqual(backupState({}, { fingerprint: fp, empty: false }, now), { kind: 'never' });
  assert.deepStrictEqual(backupState({ backupAt: now - 3 * DAY, backupHash: 'y' }, { fingerprint: fp, empty: false }, now), { kind: 'changed', days: 3 });
  assert.deepStrictEqual(backupState({ backupAt: now - 40 * DAY, backupHash: fp }, { fingerprint: fp, empty: false }, now), { kind: 'old', days: 40 });
  assert.deepStrictEqual(backupState({ backupAt: now - 3 * DAY, backupHash: fp }, { fingerprint: fp, empty: false }, now), { kind: 'ok', days: 3 });
});
