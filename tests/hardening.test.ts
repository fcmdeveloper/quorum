import { test } from 'node:test';
import assert from 'node:assert';
import { ACCOUNT_SET, HARDENING, buildHardening, describeTx } from '../src/core/tx';
import { describeActivity } from '../src/core/network';

const A = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';

test('each protection toggles on its own', () => {
  const nft = ACCOUNT_SET.asfDisallowIncomingNFTokenOffer;
  assert.deepStrictEqual(buildHardening(A, nft, false), { TransactionType: 'AccountSet', Account: A, ClearFlag: nft });
  assert.deepStrictEqual(buildHardening(A, nft, true), { TransactionType: 'AccountSet', Account: A, SetFlag: nft });
  assert.throws(() => buildHardening(A, ACCOUNT_SET.asfDisableMaster, false));
});

test('clearing a protection is described as allowing it', () => {
  for (const h of HARDENING) {
    const d = describeTx(buildHardening(A, h.asf, false));
    assert.strictEqual(d.title, h.allow);
    assert.ok(d.lines.some(([k]) => k === 'Efecto'));
    assert.strictEqual(describeTx(buildHardening(A, h.asf, true)).title, h.label);
    assert.strictEqual(describeActivity(A, buildHardening(A, h.asf, false), { TransactionResult: 'tesSUCCESS' }).title, h.allow);
  }
});
