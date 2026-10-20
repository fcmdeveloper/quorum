import { test } from 'node:test';
import assert from 'node:assert';
import { normalizeTag, normalizeXrpAmount, parsePayRequest, payLink, payMessage } from '../src/core/payRequest';
import { parseSharedProposal } from '../src/core/share';

const TO = 'rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh';
const tr = (k: string, v?: Record<string, string | number>) => k.replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ''));

test('a request link carries the payment after the # and comes back intact', () => {
  const link = payLink('https://quorumxrpl.com/', { to: TO, network: 'testnet', amount: '25,50', tag: '123', note: 'Almuerzo & café', from: 'Ana' });
  assert.ok(link.startsWith('https://quorumxrpl.com/p#pay=' + TO));
  assert.deepStrictEqual(parsePayRequest(link), { to: TO, network: 'testnet', amount: '25.5', tag: '123', note: 'Almuerzo & café', from: 'Ana' });
  // el mensaje completo pegado y el esquema de la app también sirven
  assert.equal(parsePayRequest(payMessage(parsePayRequest(link)!, link, tr))?.amount, '25.5');
  assert.equal(parsePayRequest(link.replace('https://quorumxrpl.com/p', 'quorum://p'))?.to, TO);
  // no se confunde con una operación compartida
  assert.equal(parseSharedProposal(link), null);
});

test('common wallet formats with an amount are read; a bare address is not a request', () => {
  assert.deepStrictEqual(parsePayRequest(`xrpl:${TO}?amount=10&dt=7`), { to: TO, network: 'mainnet', amount: '10', tag: '7' });
  assert.deepStrictEqual(parsePayRequest(`${TO}?amount=0.000001`), { to: TO, network: 'mainnet', amount: '0.000001' });
  assert.equal(parsePayRequest(TO), null);
  assert.equal(parsePayRequest(`${TO}?dt=7`), null);
});

test('bad data is rejected instead of guessed', () => {
  assert.equal(parsePayRequest('https://quorumxrpl.com/p#pay=rNotAnAddress&a=5'), null);
  assert.equal(parsePayRequest(`https://quorumxrpl.com/p#pay=${TO}&a=-5`), null);
  assert.equal(parsePayRequest(`https://quorumxrpl.com/p#pay=${TO}&a=1e9`), null);
  assert.equal(parsePayRequest(`https://quorumxrpl.com/p#pay=${TO}&t=99999999999`), null);
  assert.equal(normalizeXrpAmount('1.1234567'), null);
  assert.equal(normalizeXrpAmount('0'), null);
  assert.equal(normalizeXrpAmount('007.500'), '7.5');
  assert.equal(normalizeTag('4294967296'), null);
  assert.equal(normalizeTag('0'), '0');
  // sin monto es válido: quien paga lo escribe
  assert.deepStrictEqual(parsePayRequest(`https://quorumxrpl.com/p#pay=${TO}`), { to: TO, network: 'mainnet' });
});

test('names and notes are one clean line with a length limit', () => {
  const r = parsePayRequest(`https://quorumxrpl.com/p#pay=${TO}&a=1&f=${encodeURIComponent('A‮B\nC'.padEnd(80, 'x'))}`)!;
  assert.ok(!/[‮\n]/.test(r.from!));
  assert.ok(r.from!.length <= 40);
});
