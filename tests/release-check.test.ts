import { test } from 'node:test';
import assert from 'node:assert';
import { classifyRelease, isStale, needsSignConfirm, RELEASE_CHECK_EVERY_MS, RELEASE_RETRY_MS } from '../src/core/releaseCheck';
import { readReleaseLog, releaseStatus, ReleaseLog } from '../src/core/releases';

const REG = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';
const H = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const empty = (): ReleaseLog => ({ releases: [], attestations: [], joins: [], revoked: [] });
const rel = (v: string, app: string) => ({ v, app, platform: 'ios', commit: 'c'.repeat(40), tag: `v${v}`, hash: 'X', date: undefined } as any);

test('unregistered vs mismatch vs ok', () => {
  assert.strictEqual(classifyRelease(releaseStatus(empty(), '1.0.1', H)), 'unregistered');
  const log = empty();
  log.releases.push(rel('1.0.1', H2));
  assert.strictEqual(classifyRelease(releaseStatus(log, '1.0.1', H)), 'mismatch');
  log.releases.push(rel('1.0.1', H));
  assert.strictEqual(classifyRelease(releaseStatus(log, '1.0.1', H)), 'ok');
});

test('a fail attestation marks it disputed', () => {
  const log = empty();
  log.releases.push(rel('1.0.1', H));
  log.attestations.push({ release: '1.0.1', platform: 'ios', commit: 'c'.repeat(40), app: H, result: 'fail', account: 'rX', hash: 'Y' } as any);
  assert.strictEqual(classifyRelease(releaseStatus(log, '1.0.1', H)), 'disputed');
});

test('revoke applies to the whole version or one build', () => {
  const log = empty();
  log.releases.push(rel('1.0.1', H));
  log.revoked.push({ v: '1.0.1', app: H2.slice(0, 16), hash: 'Z' });
  assert.strictEqual(classifyRelease(releaseStatus(log, '1.0.1', H)), 'ok');
  log.revoked.push({ v: '1.0.1', hash: 'Z2', reason: 'bug' });
  const s = releaseStatus(log, '1.0.1', H);
  assert.strictEqual(classifyRelease(s), 'revoked');
  assert.strictEqual(s.revoked?.reason, 'bug');
});

test('only the registry account can revoke', () => {
  const memo = (text: string) => ({ Memo: { MemoData: Buffer.from(text, 'utf8').toString('hex').toUpperCase() } });
  const tx = (account: string) => ({ tx_json: { Account: account, TransactionType: 'AccountSet', Memos: [memo('quorum.revoke {"v":"1.0.1","reason":"x"}')] }, hash: 'H', meta: { TransactionResult: 'tesSUCCESS' } });
  const log = readReleaseLog(REG, [tx("rPsFmq43ngKqzbXx9nVJRRiRdaVVfs4CZZ"), tx(REG)]);
  assert.strictEqual(log.revoked.length, 1);
  assert.strictEqual(log.revoked[0].v, '1.0.1');
});

test('sign confirmation and refresh timing', () => {
  for (const s of ['unregistered', 'mismatch', 'revoked', 'disputed'] as const) assert.ok(needsSignConfirm(s));
  for (const s of ['ok', 'unknown', 'dev'] as const) assert.ok(!needsSignConfirm(s));
  assert.ok(isStale(null, null, 0));
  assert.ok(!isStale(0, 'ok', RELEASE_CHECK_EVERY_MS - 1));
  assert.ok(isStale(0, 'ok', RELEASE_CHECK_EVERY_MS));
  assert.ok(isStale(0, 'unknown', RELEASE_RETRY_MS));
});
