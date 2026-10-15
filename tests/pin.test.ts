import { test } from 'node:test';
import assert from 'node:assert';
import { ZERO_256, buildPinNft, isNftId, nftIssuer } from '../src/core/pin';
import { describeTx } from '../src/core/tx';

const ACCOUNT = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';
// La insignia Genesis: la emitió la galería de Quorum.
const GENESIS = '0000000041D4C0DD186AF626AE281F83CE50CD1F487338EC12445026066A4D31';
const GALLERY = 'rfrn8qHd6qrYXokM1du4vEFF8qUin9kirE';

test('the NFT issuer is read from inside the NFT id', () => {
  assert.strictEqual(nftIssuer(GENESIS), GALLERY);
});

test('pinning is an AccountSet that only sets WalletLocator (no funds, no flags)', () => {
  const tx = buildPinNft(ACCOUNT, GENESIS.toLowerCase());
  assert.deepStrictEqual(tx, { TransactionType: 'AccountSet', Account: ACCOUNT, WalletLocator: GENESIS });
});

test('unpinning writes zeros, which removes the field', () => {
  assert.strictEqual(buildPinNft(ACCOUNT, null).WalletLocator, ZERO_256);
  assert.ok(!isNftId(ZERO_256));
});

test('invalid ids are rejected', () => {
  assert.throws(() => buildPinNft(ACCOUNT, 'ABC'));
  assert.ok(!isNftId('Z'.repeat(64)));
});

test('signers see what the transaction does', () => {
  assert.strictEqual(describeTx(buildPinNft(ACCOUNT, GENESIS), 'mainnet').title, 'Fijar NFT como imagen');
  assert.strictEqual(describeTx(buildPinNft(ACCOUNT, null), 'mainnet').title, 'Quitar NFT fijado');
});
