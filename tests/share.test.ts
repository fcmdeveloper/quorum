import { test } from 'node:test';
import assert from 'node:assert';
import { encodeProposalQr } from '../src/core/qr';
import { cleanText, parseSharedProposal, proposalLink, shareMessage } from '../src/core/share';

const VAULT = 'rHYkBqZLWMKURQcUHAu2EJDKdzsdqt84S8';
const DEST = 'rPsFmq43ngKqzbXx9nVJRRiRdaVVfs4CZZ';
const tx = { TransactionType: 'Payment', Account: VAULT, Destination: DEST, Amount: '50000000', Fee: '48', Sequence: 0, TicketSequence: 7, LastLedgerSequence: 99, SigningPubKey: '' };
const qr = encodeProposalQr('testnet', tx as any, []);

test('a shared link carries the operation after the # and comes back intact', () => {
  const link = proposalLink('https://quorumxrpl.com', { qr, from: 'Felipe', note: 'Pago proveedor de octubre' });
  assert.ok(link.startsWith('https://quorumxrpl.com/p#q='));
  assert.deepStrictEqual(parseSharedProposal(link), { qr, from: 'Felipe', note: 'Pago proveedor de octubre' });
});

test('the whole pasted message works, and so does the app scheme and the bare QR text', () => {
  const link = proposalLink('https://quorumxrpl.com/', { qr });
  const msg = shareMessage({ qr }, { title: 'Pago', details: [['Monto', '50 XRP']], account: 'Bóveda', testnet: true, signed: 1, needed: 2, minutesLeft: 90 }, link, (k, v) =>
    k.replace(/\{(\w+)\}/g, (_, x) => String(v?.[x] ?? '')),
  );
  assert.strictEqual(parseSharedProposal(msg)?.qr, qr);
  assert.strictEqual(parseSharedProposal(link.replace('https://quorumxrpl.com/p', 'quorum://p'))?.qr, qr);
  assert.strictEqual(parseSharedProposal(qr)?.qr, qr);
});

test('names and notes are one clean line with a length limit (no control or direction characters)', () => {
  assert.strictEqual(cleanText('Fe‮li\npe\u0007', 40), 'Fe li pe');
  assert.strictEqual(cleanText('x'.repeat(300), 140)?.length, 140);
  assert.strictEqual(cleanText('   ', 10), undefined);
});

test('anything that is not a Quorum operation is ignored', () => {
  assert.strictEqual(parseSharedProposal('https://quorumxrpl.com/p#q=hola'), null);
  assert.strictEqual(parseSharedProposal('quorum://xaman-auth?code=1&state=2'), null);
  assert.strictEqual(parseSharedProposal('hola'), null);
  assert.strictEqual(parseSharedProposal(null), null);
});

test('a reply says it was signed and asks to add the signature, or to submit when complete', () => {
  const tr = (k: string, v?: Record<string, string | number>) => k.replace(/\{(\w+)\}/g, (_, n) => String(v?.[n] ?? ''));
  const base = { title: 'Pago', details: [] as [string, string][], account: 'Bóveda', testnet: false, signed: 1, needed: 3, minutesLeft: null, reply: true };
  const msg = shareMessage({ qr: 'x', from: 'Ana' }, base, 'https://quorumxrpl.com/p#q=x', tr);
  assert.match(msg, /^Ana ya firmó en Quorum y te la devuelve/);
  assert.match(msg, /sumar esta firma/);
  const done = shareMessage({ qr: 'x' }, { ...base, signed: 3 }, 'L', tr);
  assert.match(done, /^Ya firmé en Quorum y te la devuelvo/);
  assert.match(done, /envíala a la red: L$/);
  const ask = shareMessage({ qr: 'x', from: 'Ana' }, { ...base, reply: undefined }, 'L', tr);
  assert.match(ask, /^Ana te pide firmar en Quorum/);
});
