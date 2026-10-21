import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuorumMemo, readReleaseLog, releaseStatus } from '../src/core/releases';

const REG = 'rREGISTRYxxxxxxxxxxxxxxxxxxxxxxxxx';
const APP = '73880f90328d09de2e9a05160d4837cd6749090c8717282144e11d88513fb90d';
const COMMIT = '2c18196618c4f8f00d13a367010cbd5aeba4a5e3';
const hex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const memo = (s: string) => [{ Memo: { MemoData: hex(s) } }];
const tx = (t: any, ok = true, h = Math.random().toString(16).slice(2)) => ({ hash: h, tx_json: t, meta: { TransactionResult: ok ? 'tesSUCCESS' : 'tecNO_DST' } });

const release = tx({ TransactionType: 'AccountSet', Account: REG, Signers: [{ Signer: { Account: 'rA' } }, { Signer: { Account: 'rB' } }],
  Memos: memo(`quorum.release {"v":"1.0.0","build":1,"platform":"ios","commit":"${COMMIT}","app":"sha256:${APP}"}`) });
const attest = (acc: string, body: string, ok = true) => tx({ TransactionType: 'Payment', Account: acc, Destination: REG, Amount: '1', Memos: memo(`quorum.attest ${body}`) }, ok);

test('lee los memos de Quorum y descarta el resto', () => {
  assert.deepEqual(parseQuorumMemo('quorum.join {"github":"ana"}'), { kind: 'join', data: { github: 'ana' } });
  assert.equal(parseQuorumMemo('hola'), null);
  assert.equal(parseQuorumMemo('quorum.attest {roto'), null);
  assert.equal(parseQuorumMemo('quorum.other {"a":1}'), null);
});

test('una versión solo cuenta si la emite la cuenta de registro', () => {
  const fake = tx({ TransactionType: 'Payment', Account: 'rEVIL', Destination: REG, Memos: memo(`quorum.release {"v":"1.0.0","commit":"${COMMIT}","app":"${'0'.repeat(64)}"}`) });
  const log = readReleaseLog(REG, [release, fake]);
  assert.equal(log.releases.length, 1);
  assert.deepEqual(log.releases[0].signers, ['rA', 'rB']);
  assert.equal(log.releases[0].app, APP);
});

test('cuenta validaciones correctas, muestra los fail y una por cuenta', () => {
  const log = readReleaseLog(REG, [
    release,
    attest('rV1', `{"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}`),
    attest('rV1', `{"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}`),
    attest('rV2', `{"release":"1.0.0","commit":"2c18196","app":"sha256:deadbeef","result":"pass"}`),
    attest('rV3', `{"release":"1.0.0","commit":"2c18196","app":"sha256:1a2b3c4d","result":"fail","note":"differs"}`),
    attest('rV4', `{"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}`, false),
  ]);
  const st = releaseStatus(log, '1.0.0', 'sha256:' + APP.toUpperCase());
  assert.equal(st.release?.v, '1.0.0');
  assert.deepEqual(st.pass.map((a) => a.account), ['rV1']); // rV2 no coincide, rV4 falló en el ledger
  assert.deepEqual(st.fail.map((a) => a.account), ['rV3']);
});

test('si la huella no está registrada, avisa de otro registro con la misma versión', () => {
  const log = readReleaseLog(REG, [release]);
  const st = releaseStatus(log, '1.0.0', 'f'.repeat(64));
  assert.equal(st.release, undefined);
  assert.equal(st.sameVersionOther.length, 1);
});

import { buildReleaseRecord, describeTx, releaseOf } from '../src/core/tx';

test('el registro que arma la app se lee igual desde el ledger', () => {
  const REG2 = 'rDsFvWMfCvhi7sQaKJg3TvmDmS8RfY4DDt';
  const t1 = buildReleaseRecord(REG2, { v: '1.0.0', build: 1, commit: COMMIT.toUpperCase(), app: 'sha256:' + APP });
  assert.equal(t1.TransactionType, 'AccountSet');
  assert.equal(releaseOf(t1)?.v, '1.0.0');
  assert.match(describeTx(t1).title, /1\.0\.0/);
  const log = readReleaseLog(REG2, [{ hash: 'X', tx_json: { ...t1, Signers: [{ Signer: { Account: 'rA' } }] }, meta: { TransactionResult: 'tesSUCCESS' } }]);
  assert.equal(log.releases[0].commit, COMMIT);
  assert.equal(log.releases[0].app, APP);
  assert.throws(() => buildReleaseRecord(REG2, { v: '1.0', commit: COMMIT, app: APP }));
  assert.throws(() => buildReleaseRecord(REG2, { v: '1.0.0', commit: 'abc', app: APP }));
  assert.throws(() => buildReleaseRecord(REG2, { v: '1.0.0', commit: COMMIT, app: 'zz' }));
});

test('iOS y Android se registran y validan por separado; sin plataforma es iOS', () => {
  const AND = 'b'.repeat(64);
  const relAnd = tx({ TransactionType: 'AccountSet', Account: REG, Memos: memo(`quorum.release {"v":"1.0.0","platform":"android","commit":"${COMMIT}","app":"sha256:${AND}"}`) });
  const relOld = tx({ TransactionType: 'AccountSet', Account: REG, Memos: memo(`quorum.release {"v":"0.9.0","commit":"${COMMIT}","app":"sha256:${'c'.repeat(64)}"}`) });
  const relOdd = tx({ TransactionType: 'AccountSet', Account: REG, Memos: memo(`quorum.release {"v":"1.0.0","platform":"windows","commit":"${COMMIT}","app":"sha256:${'d'.repeat(64)}"}`) });
  const log = readReleaseLog(REG, [
    release, relAnd, relOld, relOdd,
    attest('rV1', `{"release":"1.0.0","commit":"2c18196","app":"sha256:73880f90","result":"pass"}`), // sin plataforma: iOS
    attest('rV1', `{"release":"1.0.0","platform":"android","commit":"2c18196","app":"sha256:bbbbbbbb","result":"pass"}`),
    attest('rV2', `{"release":"1.0.0","platform":"Android","commit":"2c18196","app":"sha256:bbbbbbbb","result":"pass"}`),
    attest('rV3', `{"release":"1.0.0","platform":"android","commit":"2c18196","app":"sha256:73880f90","result":"pass"}`), // huella de iOS declarada como Android
    attest('rV4', `{"release":"1.0.0","platform":"android","commit":"2c18196","app":"sha256:bbbbbbbb","result":"fail","note":"x"}`),
  ]);
  assert.equal(log.releases.length, 3); // "windows" no se lee
  assert.equal(log.releases.find((r) => r.v === '0.9.0')?.platform, 'ios');

  // iOS: el registro de Android con la misma versión no es una alerta, y sus validaciones no cuentan
  const ios = releaseStatus(log, '1.0.0', APP, 'ios');
  assert.equal(ios.release?.platform, 'ios');
  assert.equal(ios.sameVersionOther.length, 0);
  assert.deepEqual(ios.pass.map((a) => a.account), ['rV1']);
  assert.deepEqual(ios.fail, []);

  const and = releaseStatus(log, '1.0.0', AND, 'android');
  assert.equal(and.release?.platform, 'android');
  assert.deepEqual(and.pass.map((a) => a.account), ['rV1', 'rV2']);
  assert.deepEqual(and.fail.map((a) => a.account), ['rV4']);

  // la huella de iOS en un teléfono Android no se da por registrada
  const cross = releaseStatus(log, '1.0.0', APP, 'android');
  assert.equal(cross.release, undefined);
  assert.equal(cross.sameVersionOther.length, 1);
});

test('retirar una versión: con plataforma solo esa, sin plataforma todas', () => {
  const AND = 'b'.repeat(64);
  const relAnd = tx({ TransactionType: 'AccountSet', Account: REG, Memos: memo(`quorum.release {"v":"1.0.0","platform":"android","commit":"${COMMIT}","app":"sha256:${AND}"}`) });
  const rev = (body: string) => tx({ TransactionType: 'AccountSet', Account: REG, Memos: memo(`quorum.revoke ${body}`) });
  const onlyAnd = readReleaseLog(REG, [release, relAnd, rev('{"v":"1.0.0","platform":"android"}')]);
  assert.equal(releaseStatus(onlyAnd, '1.0.0', APP, 'ios').revoked, undefined);
  assert.ok(releaseStatus(onlyAnd, '1.0.0', AND, 'android').revoked);
  const all = readReleaseLog(REG, [release, relAnd, rev('{"v":"1.0.0"}')]);
  assert.ok(releaseStatus(all, '1.0.0', APP, 'ios').revoked);
  assert.ok(releaseStatus(all, '1.0.0', AND, 'android').revoked);
});

test('el registro que arma la app lleva su plataforma', () => {
  const REG2 = 'rDsFvWMfCvhi7sQaKJg3TvmDmS8RfY4DDt';
  const t1 = buildReleaseRecord(REG2, { v: '1.0.3', build: 4, platform: 'android', commit: COMMIT, app: APP });
  const log = readReleaseLog(REG2, [{ hash: 'Y', tx_json: t1, meta: { TransactionResult: 'tesSUCCESS' } }]);
  assert.equal(log.releases[0].platform, 'android');
  assert.ok(describeTx(t1).lines.some(([k, v]) => v === 'Android'));
  assert.throws(() => buildReleaseRecord(REG2, { v: '1.0.3', platform: 'web', commit: COMMIT, app: APP }));
});
