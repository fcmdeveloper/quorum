import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { ECDSA, Wallet, verifySignature } from 'xrpl';
import { Account as SecretAccount } from '@xrplf/secret-numbers';
import {
  addressFromSecret,
  generateSecret,
  isPreparing,
  rowValid,
  setupBalanceLimitXrp,
  setupMinimumXrp,
  signWithSecret,
  signerProblem,
} from '../src/core/seedVault';
import { buildDisableMaster, buildSignerListSet } from '../src/core/tx';
import { mergeBackup } from '../src/core/backup';

if (!(globalThis as any).crypto) (globalThis as any).crypto = webcrypto;

test('generateSecret: 8 filas válidas y distintas cada vez', () => {
  const a = generateSecret();
  const b = generateSecret();
  assert.equal(a.length, 8);
  a.forEach((r, i) => assert.ok(rowValid(i, r), `fila ${i} inválida: ${r}`));
  assert.notDeepEqual(a, b);
});

test('los números secretos dan la misma dirección que la librería de referencia (formato Xaman)', () => {
  const rows = generateSecret();
  const ref = new SecretAccount(rows);
  assert.equal(addressFromSecret(rows), ref.getAddress());
  // y la misma que xrpl.js desde la semilla equivalente
  assert.equal(Wallet.fromSeed(ref.getFamilySeed(), { algorithm: ECDSA.secp256k1 }).classicAddress, ref.getAddress());
});

test('rowValid detecta un dígito cambiado y filas incompletas', () => {
  const rows = generateSecret();
  const bad = rows[3].slice(0, 5) + String((Number(rows[3][5]) + 1) % 10);
  assert.equal(rowValid(3, bad), false);
  assert.equal(rowValid(0, '123'), false);
  assert.equal(rowValid(0, 'abcdef'), false);
});

test('signWithSecret firma y la firma se verifica de forma independiente', () => {
  const rows = generateSecret();
  const addr = addressFromSecret(rows);
  const tx = { ...buildDisableMaster(addr), Fee: '12', Sequence: 5, LastLedgerSequence: 100 };
  const r = signWithSecret(tx, rows);
  assert.ok(verifySignature(r.blob));
  assert.equal(r.tx.Account, addr);
  assert.ok(r.tx.TxnSignature);
});

test('signWithSecret se niega a firmar por otra cuenta', () => {
  const rows = generateSecret();
  const other = addressFromSecret(generateSecret());
  const tx = { ...buildSignerListSet(other, 2, [
    { account: Wallet.generate().classicAddress, weight: 1 },
    { account: Wallet.generate().classicAddress, weight: 1 },
  ]), Fee: '12', Sequence: 1, LastLedgerSequence: 10 };
  assert.throws(() => signWithSecret(tx, rows), /no son los de esta bóveda/);
});

test('mínimo y límite de fondos para preparar la bóveda', () => {
  const r = { base: 1, inc: 0.2 };
  assert.equal(setupMinimumXrp(r, 5), 3.2);
  assert.equal(setupMinimumXrp(r, 0), 2.2);
  assert.equal(setupBalanceLimitXrp(r, 5), 8.2);
});

test('signerProblem: rechaza bóvedas y cuentas que no pueden firmar', () => {
  const base = { exists: true, masterDisabled: false, regularKey: null, signerList: null };
  assert.equal(signerProblem(base, false), null);
  assert.equal(signerProblem({ ...base, exists: false }, false), null);
  assert.equal(signerProblem(undefined, false), null);
  assert.match(signerProblem(base, true)!, /creada en Quorum/);
  assert.match(signerProblem({ ...base, signerList: { quorum: 2 } }, false)!, /otra bóveda/);
  assert.match(signerProblem({ ...base, masterDisabled: true }, false)!, /no podría firmar/);
  assert.equal(signerProblem({ ...base, masterDisabled: true, regularKey: 'rX' }, false), null);
});

test('isPreparing: solo bóvedas creadas en Quorum con master key activa', () => {
  assert.equal(isPreparing({ origin: 'quorum' }, { exists: true, masterDisabled: false }), true);
  assert.equal(isPreparing({ origin: 'quorum' }, { exists: true, masterDisabled: true }), false);
  assert.equal(isPreparing({ origin: 'quorum' }, undefined), true);
  assert.equal(isPreparing({}, { exists: true, masterDisabled: false }), false);
});

test('el respaldo conserva la marca de bóveda creada en Quorum', () => {
  const acc = { id: 'x', label: 'B', kind: 'vault' as const, network: 'testnet' as const, address: Wallet.generate().classicAddress, createdAt: 1, origin: 'quorum' as const };
  const m = mergeBackup(
    { devices: [], accounts: [], contacts: [], proposals: [] },
    { devices: [], accounts: [acc], contacts: [], proposals: [], settings: { fiat: 'usd', validityMinutes: 120, hideBalances: false } as any },
  );
  assert.equal((m.data.accounts[0] as any).origin, 'quorum');
});
