import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BADGE_TAXON, badgeRows, buildBadgeMint, buildBadgeOffer, readBadgeMints } from '../src/core/badges';
import { readReleaseLog } from '../src/core/releases';
import { describeTx } from '../src/core/tx';

const REG = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';
const GAL = 'rfrn8qHd6qrYXokM1du4vEFF8qUin9kirE';
const APP = '73880f90328d09de2e9a05160d4837cd6749090c8717282144e11d88513fb90d';
const COMMIT = '2c18196618c4f8f00d13a367010cbd5aeba4a5e3';
const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const ok = (t: any, extra: any = {}) => ({ hash: Math.random().toString(16).slice(2), tx_json: t, meta: { TransactionResult: 'tesSUCCESS', ...extra } });
const att = (acc: string) => ok({ TransactionType: 'Payment', Account: acc, Destination: REG, Amount: '1', Memos: [{ Memo: { MemoData: hex('quorum.attest {"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}') } }] });

test('la insignia no es transferible, lleva su memo y se describe antes de firmar', () => {
  const m = buildBadgeMint(GAL, '1.0.0', 'rV1', 'https://quorumxrpl.com/nft/validator-1.0.0.json');
  assert.equal(m.Flags & 8, 0);
  assert.equal(m.NFTokenTaxon, BADGE_TAXON);
  assert.match(describeTx(m).title, /1\.0\.0/);
  const o = buildBadgeOffer(GAL, 'ABC', 'rV1');
  assert.equal(o.Amount, '0');
  assert.equal(o.Destination, 'rV1');
});

test('estado de cada insignia sale del ledger', () => {
  const log = readReleaseLog(REG, [
    ok({ TransactionType: 'AccountSet', Account: REG, Memos: [{ Memo: { MemoData: hex(`quorum.release {"v":"1.0.0","commit":"${COMMIT}","app":"sha256:${APP}"}`) } }] }),
    att('rV1'), att('rV2'), att('rV3'), att('rV4'), att('rMINIFY'),
  ]);
  const mintTx = (to: string, id: string) => ok(buildBadgeMint(GAL, '1.0.0', to, 'https://x/y.json'), { nftoken_id: id });
  const mints = readBadgeMints(GAL, [mintTx('rV2', 'N2'), mintTx('rV3', 'N3'), mintTx('rV4', 'N4')]);
  const rows = badgeRows(log, mints, new Set(['N2', 'N3']), [{ nftId: 'N3', to: 'rV3' }], new Set(['rMINIFY']));
  const by = Object.fromEntries(rows.map((r) => [r.to, r.state]));
  assert.deepEqual(by, { rV1: 'todo', rV2: 'minted', rV3: 'offered', rV4: 'delivered' });
});

test('una insignia por plataforma: quien valida iOS y Android recibe dos', () => {
  const AND = 'b'.repeat(64);
  const attA = (acc: string) => ok({ TransactionType: 'Payment', Account: acc, Destination: REG, Amount: '1', Memos: [{ Memo: { MemoData: hex('quorum.attest {"release":"1.0.0","platform":"android","commit":"2c18196","app":"sha256:bbbbbbbb","result":"pass"}') } }] });
  const log = readReleaseLog(REG, [
    ok({ TransactionType: 'AccountSet', Account: REG, Memos: [{ Memo: { MemoData: hex(`quorum.release {"v":"1.0.0","commit":"${COMMIT}","app":"sha256:${APP}"}`) } }] }),
    ok({ TransactionType: 'AccountSet', Account: REG, Memos: [{ Memo: { MemoData: hex(`quorum.release {"v":"1.0.0","platform":"android","commit":"${COMMIT}","app":"sha256:${AND}"}`) } }] }),
    att('rV1'), attA('rV1'), attA('rV2'),
  ]);
  // la insignia de iOS de rV1 ya está entregada (memo sin plataforma, como las acuñadas antes)
  const oldMint = ok({ ...buildBadgeMint(GAL, '1.0.0', 'rV1', 'https://x/y.json') }, { nftoken_id: 'N1' });
  const andMint = ok(buildBadgeMint(GAL, '1.0.0', 'rV2', 'https://x/y.json', 'android'), { nftoken_id: 'N2' });
  assert.ok(!hex('"platform"').length || !Buffer.from(oldMint.tx_json.Memos[0].Memo.MemoData, 'hex').toString().includes('platform'));
  const mints = readBadgeMints(GAL, [oldMint, andMint]);
  assert.deepEqual(mints.map((m) => m.platform), ['ios', 'android']);
  const rows = badgeRows(log, mints, new Set(['N2']), [], new Set());
  const by = Object.fromEntries(rows.map((r) => [`${r.to}:${r.platform}`, r.state]));
  assert.deepEqual(by, { 'rV1:ios': 'delivered', 'rV1:android': 'todo', 'rV2:android': 'minted' });
});
