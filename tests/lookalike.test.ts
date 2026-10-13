import { test } from 'node:test';
import assert from 'node:assert';
import { looksLike, lookalikeOf, trustedAddresses } from '../src/core/lookalike';

const MINE = 'rp3TQpcDDQK9nspvkZ7NuBtQH9K49AQDBy';
const OTHER = 'rBTnGzwQgFoad2xKk1de4BFcpEr64Gt2X9';

test('detecta una dirección que copia el inicio y el final', () => {
  const fake = 'rp3TQxxxxxxxxxxxxxxxxxxxxxxxxxxQDBy';
  assert.ok(looksLike(fake, MINE));
  assert.deepStrictEqual(lookalikeOf(fake, [{ address: MINE, label: 'Bóveda' }]), { address: MINE, label: 'Bóveda' });
});

test('detecta copias solo del final o solo del inicio', () => {
  assert.ok(looksLike('rzzzzzzzzzzzzzzzzzzzzzzzzzzz49AQDBy', MINE)); // últimos 5
  assert.ok(looksLike('rp3TQpczzzzzzzzzzzzzzzzzzzzzzzzzz', MINE)); // primeros 6
});

test('no marca la misma dirección ni direcciones distintas', () => {
  assert.strictEqual(looksLike(MINE, MINE), false);
  assert.strictEqual(looksLike(OTHER, MINE), false);
  assert.strictEqual(lookalikeOf(MINE, [{ address: MINE, label: 'x' }]), null);
  assert.strictEqual(lookalikeOf(OTHER, [{ address: MINE, label: 'x' }]), null);
});

test('una dirección de confianza nunca se marca, aunque se parezca a otra', () => {
  const twin = 'rp3TQxxxxxxxxxxxxxxxxxxxxxxxxxxQDBy';
  const trusted = [
    { address: MINE, label: 'a' },
    { address: twin, label: 'b' },
  ];
  assert.strictEqual(lookalikeOf(twin, trusted), null);
});

test('reúne cuentas, dispositivos, contactos y destinos permitidos sin repetir', () => {
  const t = trustedAddresses({
    accounts: [{ address: MINE, label: 'Bóveda', allowed: [OTHER] }],
    devices: [{ address: MINE, label: 'Tangem' }],
    contacts: [{ address: OTHER, label: 'Exchange' }],
  });
  assert.strictEqual(t.length, 2);
  assert.strictEqual(t.find((x) => x.address === MINE)?.label, 'Bóveda');
  assert.strictEqual(t.find((x) => x.address === OTHER)?.label, 'Exchange');
});
