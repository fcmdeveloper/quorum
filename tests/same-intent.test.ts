import { test } from 'node:test';
import assert from 'node:assert';
import { buildPayment, buildRemoveTrust, buildTrustSet, sameIntent } from '../src/core/tx';

const V = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const USDC = { currency: '5553444300000000000000000000000000000000', issuer: 'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE' };

test('a double tap is the same operation even with another turn, deadline or fee', () => {
  const a = buildTrustSet(V, USDC);
  const prepared = { ...a, Sequence: 12, Fee: '36', LastLedgerSequence: 999, SigningPubKey: '', NetworkID: undefined };
  const stored = JSON.parse(JSON.stringify({ ...a, TicketSequence: 7, Sequence: 0, Fee: '48', LastLedgerSequence: 1200, SigningPubKey: '' }));
  assert.ok(sameIntent(prepared, buildTrustSet(V, USDC)));
  assert.ok(sameIntent(stored, buildTrustSet(V, USDC)));
});

test('different operations are not merged', () => {
  assert.ok(!sameIntent(buildTrustSet(V, USDC), buildRemoveTrust(V, USDC)));
  const dest = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
  assert.ok(!sameIntent(buildPayment(V, dest, '10'), buildPayment(V, dest, '11')));
  assert.ok(!sameIntent(buildPayment(V, dest, '10', '5'), buildPayment(V, dest, '10')));
  assert.ok(sameIntent(buildPayment(V, dest, '10'), JSON.parse(JSON.stringify({ ...buildPayment(V, dest, '10'), Sequence: 3, Fee: '12' }))));
});
