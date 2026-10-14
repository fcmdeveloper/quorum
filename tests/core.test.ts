import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, multisign as xrplMultisign, verifySignature } from 'xrpl';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { encode, decode, encodeForMultisigning } from 'ripple-binary-codec';
import { verify as rkVerify } from 'ripple-keypairs';
import {
  toCanonicalDer,
  multisignHash,
  singleSignHash,
  bytesToHex,
  hexToBytes,
  addressFromPublicKey,
  compressPublicKey,
} from '../src/core/crypto';
import {
  buildPayment,
  buildSignerListSet,
  combineSignatures,
  normalizeForMultisign,
  attachSingleSignature,
  signerSigFromBlob,
  xrpToDrops,
  dropsToXrp,
  describeTx,
  SignerSig,
} from '../src/core/tx';

/** Verificación independiente (ripple-keypairs) de cada firma de un blob multifirmado. */
function verifyMultisigned(blob: string): boolean {
  const t: any = decode(blob);
  if (!t.Signers?.length || t.SigningPubKey !== '') return false;
  const { Signers, ...base } = t;
  return Signers.every((x: any) =>
    rkVerify(encodeForMultisigning(base, x.Signer.Account), x.Signer.TxnSignature, x.Signer.SigningPubKey),
  );
}

const vault = Wallet.generate('ecdsa-secp256k1' as any);
const s1 = Wallet.generate('ecdsa-secp256k1' as any);
const s2 = Wallet.generate('ecdsa-secp256k1' as any);
const s3 = Wallet.generate('ecdsa-secp256k1' as any);

function prepared() {
  return normalizeForMultisign({
    ...buildPayment(vault.classicAddress, s3.classicAddress, '12.5', '77', 'prueba'),
    Fee: '36',
    Sequence: 42,
    LastLedgerSequence: 99999999,
  });
}

/** Simula una tarjeta Tangem: firma el hash y devuelve r||s crudo (64 bytes), sin normalizar S. */
function tangemLikeSign(hash: Uint8Array, privHex: string, forceHighS = false): string {
  const priv = hexToBytes(privHex.length === 66 ? privHex.slice(2) : privHex);
  const sig = secp256k1.sign(hash, priv, { prehash: false, lowS: true, format: 'compact' });
  let r = sig.slice(0, 32);
  let s = BigInt('0x' + bytesToHex(sig.slice(32)));
  if (forceHighS) s = secp256k1.Point.CURVE().n - s;
  return bytesToHex(r) + s.toString(16).padStart(64, '0').toUpperCase();
}

function tangemSigner(w: Wallet, tx: any, highS = false): SignerSig {
  const raw = tangemLikeSign(multisignHash(tx, w.classicAddress), w.privateKey, highS);
  return { Account: w.classicAddress, SigningPubKey: w.publicKey, TxnSignature: toCanonicalDer(raw) };
}

test('montos XRP ↔ drops', () => {
  assert.equal(xrpToDrops('1'), '1000000');
  assert.equal(xrpToDrops('0,000001'), '1');
  assert.equal(xrpToDrops('12.5'), '12500000');
  assert.throws(() => xrpToDrops('1.1234567'));
  assert.throws(() => xrpToDrops('0'));
  assert.equal(dropsToXrp('12500000'), '12.5');
});

test('dirección desde clave pública (comprimida y no comprimida)', () => {
  assert.equal(addressFromPublicKey(s1.publicKey), s1.classicAddress);
  const uncompressed = bytesToHex(secp256k1.Point.fromBytes(hexToBytes(s1.publicKey)).toBytes(false));
  assert.equal(compressPublicKey(uncompressed), s1.publicKey.toUpperCase());
  assert.equal(addressFromPublicKey(uncompressed), s1.classicAddress);
});

test('firma estilo Tangem (r||s, S alto) produce la misma firma que xrpl.js', () => {
  const tx = prepared();
  const ours = tangemSigner(s1, tx, true);
  const ref = s1.sign(tx as any, true);
  const refSigner = signerSigFromBlob(ref.tx_blob, s1.classicAddress);
  assert.equal(ours.TxnSignature, refSigner.TxnSignature.toUpperCase());
});

test('combinación 2 de 3 equivale a xrpl.multisign y verifica', () => {
  const tx = prepared();
  const list = {
    quorum: 2,
    entries: [s1, s2, s3].map((w) => ({ account: w.classicAddress, weight: 1 })),
  };
  // orden inverso a propósito: combineSignatures debe ordenar
  const combined = combineSignatures(tx, [tangemSigner(s2, tx), tangemSigner(s1, tx)], list);
  const ref = xrplMultisign([s1.sign(tx as any, true).tx_blob, s2.sign(tx as any, true).tx_blob]);
  assert.equal(combined.blob, ref);
  assert.equal(verifyMultisigned(combined.blob), true);
  assert.equal(combined.weight, 2);
});

test('rechaza firma de otra transacción, quórum insuficiente y firmante ajeno', () => {
  const tx = prepared();
  const other = { ...tx, Sequence: 43 };
  const list = { quorum: 2, entries: [s1, s2].map((w) => ({ account: w.classicAddress, weight: 1 })) };
  assert.throws(() => combineSignatures(tx, [tangemSigner(s1, other), tangemSigner(s2, tx)], list), /no es válida/);
  assert.throws(() => combineSignatures(tx, [tangemSigner(s1, tx)], list), /quórum/);
  assert.throws(() => combineSignatures(tx, [tangemSigner(s1, tx), tangemSigner(s3, tx)], list), /no está en la lista/);
});

test('firma tipo Xaman (blob multifirmado de un solo firmante) se puede extraer y combinar', () => {
  const tx = prepared();
  const xamanBlob = s3.sign(tx as any, true).tx_blob;
  const sig = signerSigFromBlob(xamanBlob, s3.classicAddress);
  const combined = combineSignatures(tx, [sig, tangemSigner(s1, tx)]);
  assert.equal(verifyMultisigned(combined.blob), true);
});

test('firma tipo Ledger (DER sobre la tx con SigningPubKey vacío) verifica', () => {
  // El Ledger recibe encode(tx) con SigningPubKey "" y devuelve DER del hash de multifirma.
  const tx = prepared();
  const blobForDevice = encode(tx as any);
  assert.ok(blobForDevice.length > 0);
  const der = secp256k1
    .sign(multisignHash(tx, s2.classicAddress), hexToBytes(s2.privateKey.slice(2)), { prehash: false, format: 'der' });
  const sig: SignerSig = { Account: s2.classicAddress, SigningPubKey: s2.publicKey, TxnSignature: bytesToHex(der) };
  const combined = combineSignatures(tx, [sig, tangemSigner(s1, tx)]);
  assert.equal(verifyMultisigned(combined.blob), true);
});

test('firma simple con la master key (configuración inicial)', () => {
  const tx = {
    ...buildSignerListSet(vault.classicAddress, 2, [s1, s2, s3].map((w) => ({ account: w.classicAddress, weight: 1 }))),
    Fee: '12',
    Sequence: 5,
  };
  const withKey = { ...tx, SigningPubKey: vault.publicKey.toUpperCase() };
  const raw = tangemLikeSign(singleSignHash(withKey), vault.privateKey, true);
  const res = attachSingleSignature(tx, vault.publicKey, toCanonicalDer(raw));
  assert.equal(res.blob, vault.sign(tx as any).tx_blob);
  assert.equal(verifySignature(res.blob), true);
  assert.throws(() => attachSingleSignature(tx, s1.publicKey, toCanonicalDer(raw)), /clave maestra/);
});

test('validaciones de SignerListSet', () => {
  const e = (w: Wallet) => ({ account: w.classicAddress, weight: 1 });
  assert.throws(() => buildSignerListSet(vault.classicAddress, 3, [e(s1), e(s2)]), /inalcanzable/);
  assert.throws(() => buildSignerListSet(vault.classicAddress, 1, [e(s1), e(s1)]), /duplicado/);
  assert.throws(() => buildSignerListSet(vault.classicAddress, 1, [e(vault)]), /sí misma/);
  const d = describeTx(buildSignerListSet(vault.classicAddress, 2, [e(s1), e(s2), e(s3)]));
  assert.equal(d.title, 'Configurar lista de firmantes');
});

import { encodeProposalQr, decodeProposalQr, proposalIdFor, mergeSigs, parseAddressQr } from '../src/core/qr';
import { buildTicketCreate, buildSetFlag, HARDENING } from '../src/core/tx';
import { describeActivity } from '../src/core/network';
import { fiatToXrp } from '../src/core/market';

test('QR de propuesta: ida y vuelta con firmas, id estable y fusión', () => {
  const tx = prepared();
  const a = tangemSigner(s1, tx);
  const b = tangemSigner(s2, tx);
  const qrA = encodeProposalQr('testnet', tx, [a]);
  const qrB = encodeProposalQr('testnet', tx, [b]);
  assert.ok(qrA.length < 1500, `QR demasiado grande: ${qrA.length}`);
  const dA = decodeProposalQr(qrA);
  const dB = decodeProposalQr(qrB);
  assert.equal(dA.id, proposalIdFor(tx));
  assert.equal(dA.id, dB.id);
  const merged = mergeSigs(dA.signatures, dB.signatures);
  assert.equal(merged.length, 2);
  const combined = combineSignatures(dA.tx, merged);
  assert.equal(verifyMultisigned(combined.blob), true);
});

test('QR alterado: rechaza firma que no corresponde', () => {
  const tx = prepared();
  const other = { ...tx, Amount: '999' };
  const forged = encodeProposalQr('testnet', other, []).split('|');
  // firmas válidas para tx pero metidas en otra transacción
  const bad = encodeProposalQr('testnet', tx, [tangemSigner(s1, tx)]).split('|');
  const swapped = `${forged[0]}|${forged[1]}|${bad[2]}`;
  assert.ok(decodeProposalQr(swapped)); // el original sigue válido
  const evil = encodeProposalQr('testnet', other, []).replace(/\|[^|]+$/, '|' + Buffer.from(
    encode({ ...normalizeForMultisign(other), Signers: [{ Signer: tangemSigner(s1, tx) }] } as any), 'hex').toString('base64'));
  assert.throws(() => decodeProposalQr(evil), /firma inválida/);
});

test('ticket, banderas de endurecimiento y actividad legible', () => {
  const t = buildTicketCreate(vault.classicAddress, 5);
  assert.equal(t.TicketCount, 5);
  assert.equal(describeTx(t).title, 'Crear tickets');
  const f = buildSetFlag(vault.classicAddress, HARDENING[0].asf);
  assert.equal(describeTx(f).title, HARDENING[0].label);
  const ticketTx = normalizeForMultisign({ ...buildPayment(vault.classicAddress, s1.classicAddress, '1'), Fee: '40', Sequence: 0, TicketSequence: 12 });
  const c = combineSignatures(ticketTx, [tangemSigner(s1, ticketTx), tangemSigner(s2, ticketTx)]);
  assert.equal(verifyMultisigned(c.blob), true);
  const act = describeActivity(s1.classicAddress, { TransactionType: 'Payment', Account: vault.classicAddress, Destination: s1.classicAddress, Amount: '2500000', hash: 'H' }, { TransactionResult: 'tesSUCCESS', delivered_amount: '2500000' });
  assert.equal(act.kind, 'in');
  assert.equal(act.xrp, '2.5');
});

test('conversión de divisa y lectura de QR de dirección', () => {
  const q = { price: { usd: 2.5, eur: 2.2 }, change24h: { usd: 0, eur: 0 }, at: 0 };
  assert.equal(fiatToXrp(100, 'usd', q), '40');
  assert.equal(fiatToXrp(11, 'eur', q), '5');
  assert.deepEqual(parseAddressQr(`xrpl:${s1.classicAddress}?dt=123`), { address: s1.classicAddress, tag: '123' });
  assert.equal(parseAddressQr('hola'), null);
});

import { KNOWN_TOKENS, amountOf, assetSymbol, iouValue, XRP as XRP_ASSET } from '../src/core/assets';
import { buildAssetPayment, buildLimitOrder, buildOfferCancel, buildSwap, buildTrustSet, OFFER_FLAGS } from '../src/core/tx';
import { ammOut, bookOut } from '../src/core/dex';

test('stablecoins: símbolos, montos IOU y emisores oficiales', () => {
  const r = KNOWN_TOKENS.mainnet[0];
  assert.equal(assetSymbol({ currency: r.currency, issuer: r.issuer }, 'mainnet'), 'RLUSD');
  assert.equal(assetSymbol({ currency: r.currency, issuer: 'rUnknownIssuerxxxxxxxxxxxxxxxxxxxx' }), 'RLUSD');
  assert.equal(r.issuer, 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De');
  assert.equal(KNOWN_TOKENS.mainnet[1].issuer, 'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE');
  assert.equal(iouValue(0.1 + 0.2), '0.3');
  assert.equal(amountOf(XRP_ASSET, '1.5'), '1500000');
  assert.deepEqual(amountOf({ currency: r.currency, issuer: r.issuer }, 12.5), { currency: r.currency, issuer: r.issuer, value: '12.5' });
});

test('transacciones de token, swap y DEX se codifican y se pueden multifirmar', () => {
  const r = KNOWN_TOKENS.mainnet[0];
  const tok = { currency: r.currency, issuer: r.issuer };
  const txs = [
    buildTrustSet(vault.classicAddress, tok),
    buildAssetPayment(vault.classicAddress, s1.classicAddress, tok, '25', { transferRate: 1.002 }),
    buildSwap(vault.classicAddress, XRP_ASSET, 100, tok, 230.5),
    buildLimitOrder(vault.classicAddress, 'buy', XRP_ASSET, tok, 50, 2.4),
    buildLimitOrder(vault.classicAddress, 'sell', XRP_ASSET, tok, 50, 2.6),
    buildOfferCancel(vault.classicAddress, 77),
  ];
  for (const t of txs) {
    const tx = normalizeForMultisign({ ...t, Fee: '40', Sequence: 9, LastLedgerSequence: 1000 });
    const c = combineSignatures(tx, [tangemSigner(s1, tx), tangemSigner(s2, tx)]);
    assert.equal(verifyMultisigned(c.blob), true, t.TransactionType);
    assert.ok(describeTx(tx, 'mainnet').title.length > 0);
  }
  const pay = txs[1];
  assert.ok(pay.SendMax && Number(pay.SendMax.value) > 25);
  const swap = txs[2];
  assert.equal(swap.Flags & OFFER_FLAGS.tfFillOrKill, OFFER_FLAGS.tfFillOrKill);
  assert.equal(swap.TakerGets, '100000000');
  assert.equal(describeTx(swap, 'mainnet').title, 'Swap');
  const buy = txs[3];
  assert.equal(buy.TakerPays, '50000000');
  assert.equal(buy.TakerGets.value, '120');
});

test('cotización: AMM de producto constante y recorrido del libro', () => {
  const out = ammOut({ amountA: 1_000_000, amountB: 2_400_000, fee: 0.003 }, 1000);
  assert.ok(out > 2390 && out < 2400, String(out));
  const b = bookOut([{ gets: 240, pays: 100 }, { gets: 230, pays: 100 }], 150);
  assert.equal(b.filled, 150);
  assert.equal(b.out, 240 + 115);
});

import { xamanInstruction } from '../src/core/xamanText';
test('texto de Xaman identifica a Quorum y la operación', () => {
  const t = xamanInstruction(buildPayment(vault.classicAddress, s1.classicAddress, '25') as any, true);
  assert.match(t, /^Quorum · Pago de 25 XRP a r/);
  assert.match(t, /multifirma/);
  assert.ok(!/Bóveda XRPL/.test(t));
});

import { ipfsPath, ipfsToHttp } from '../src/core/network';
test('URIs de NFT: ipfs://, CID, gateway y arweave', () => {
  const cid = 'QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
  assert.equal(ipfsPath(`ipfs://${cid}/1.json`), `${cid}/1.json`);
  assert.equal(ipfsPath(`ipfs://ipfs/${cid}`), cid);
  assert.equal(ipfsPath(`${cid}/meta.json`), `${cid}/meta.json`);
  assert.equal(ipfsPath(`https://gateway.pinata.cloud/ipfs/${cid}/a.png`), `${cid}/a.png`);
  assert.equal(ipfsToHttp(`ipfs://${cid}`, 1, [0, 1, 2, 3]), `https://ipfs.aleph.cloud/ipfs/${cid}`);
  // forma subdominio (nft.storage, dweb.link): se reescribe a nuestros gateways
  assert.equal(ipfsPath(`https://${'b' + 'a'.repeat(58)}.ipfs.nftstorage.link/meta.json`), `${'b' + 'a'.repeat(58)}/meta.json`);
  assert.equal(ipfsPath(`https://${'b' + 'a'.repeat(58)}.ipfs.dweb.link/`), 'b' + 'a'.repeat(58));
  // ya no se usan los gateways retirados
  assert.ok(!ipfsToHttp(`ipfs://${cid}`)!.includes('ipfs.io'));
  assert.equal(ipfsToHttp('ar://abc'), 'https://arweave.net/abc');
  assert.equal(ipfsPath('https://example.com/x.json'), null);
});

import { createHash } from 'node:crypto';
import { pkceChallenge, authorizeUrl, parseRedirect, sessionFromJwt, sessionValid, base64url, tokenRequestBody } from '../src/core/xamanAuth';
test('Xaman PKCE: challenge S256, URL de autorización, redirect y JWT', () => {
  for (const v of ['dBjftJeZ4CVP-mJ0OLOdbWWBWzwq1M9Hg0Ldh6U0VMk', 'a', 'ab', 'abc-_~.xyz']) {
    assert.equal(pkceChallenge(v), createHash('sha256').update(v).digest('base64url'));
  }
  const u = authorizeUrl({ clientId: 'abc', redirectUri: 'quorum://xaman-auth', challenge: 'CH', state: 'st' });
  assert.ok(u.startsWith('https://oauth2.xumm.app/auth?response_type=code&client_id=abc&redirect_uri=quorum%3A%2F%2Fxaman-auth'));
  assert.ok(u.includes('code_challenge=CH&code_challenge_method=S256'));
  assert.ok(tokenRequestBody({ clientId: 'abc', redirectUri: 'quorum://x', code: 'c1', verifier: 'v1' }).includes('code_verifier=v1'));
  assert.deepEqual(parseRedirect('quorum://xaman-auth?code=XYZ&state=st'), { code: 'XYZ', state: 'st' });
  const enc = (o: object) => base64url(new TextEncoder().encode(JSON.stringify(o)));
  const exp = Math.floor(Date.now() / 1000) + 24 * 3600;
  const jwt = `${enc({ alg: 'RS256' })}.${enc({ sub: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe', exp, name: 'Señor ñ' })}.sig`;
  const s = sessionFromJwt(jwt);
  assert.equal(s.account, 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe');
  assert.equal(s.exp, exp * 1000);
  assert.ok(sessionValid(s));
  assert.ok(!sessionValid({ ...s, exp: Date.now() + 5 * 60_000 }));
  assert.ok(!sessionValid(null));
});

import { acceptXamanSigned } from '../src/core/tx';
test('Xaman firma simple: acepta ajustes de comisión/secuencia y rechaza cambios de contenido', () => {
  const w = Wallet.generate('ecdsa-secp256k1' as any);
  const proposed: any = { TransactionType: 'AccountSet', Account: w.address, SetFlag: 15, Fee: '12', Sequence: 10, LastLedgerSequence: 1000, Flags: 0 };
  // Xaman sube la comisión, cambia la ventana y agrega tfFullyCanonicalSig
  const adj = w.sign({ ...proposed, Fee: '15', LastLedgerSequence: 1200, Flags: 0x80000000 } as any);
  const r = acceptXamanSigned(proposed, adj.tx_blob);
  assert.equal(r.hash, adj.hash);
  assert.equal(r.tx.Fee, '15');
  // contenido distinto: otro flag
  const bad = w.sign({ ...proposed, SetFlag: 12 } as any);
  assert.throws(() => acceptXamanSigned(proposed, bad.tx_blob), /campo SetFlag/);
  // comisión abusiva
  const fee = w.sign({ ...proposed, Fee: '5000000' } as any);
  assert.throws(() => acceptXamanSigned(proposed, fee.tx_blob), /Comisión/);
});

test('Xaman firma simple: montos de token equivalentes en otra notación no cuentan como cambio', () => {
  const w = Wallet.generate('ecdsa-secp256k1' as any);
  const RL = '524C555344000000000000000000000000000000';
  const iss = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De';
  const proposed: any = { TransactionType: 'OfferCreate', Account: w.address, TakerGets: { currency: RL, issuer: iss, value: '5.10' }, TakerPays: '2500000', Fee: '12', Sequence: 3, Flags: 0 };
  const signed = w.sign({ ...proposed, TakerGets: { ...proposed.TakerGets, value: '5.1' }, Fee: '15' } as any);
  assert.equal(acceptXamanSigned(proposed, signed.tx_blob).tx.Fee, '15');
  const other = w.sign({ ...proposed, TakerGets: { ...proposed.TakerGets, value: '5.2' } } as any);
  assert.throws(() => acceptXamanSigned(proposed, other.tx_blob), /TakerGets.*5\.1.*5\.2/);
});

import { buildRemoveSignerList, buildClearFlag, buildEnableMaster } from '../src/core/tx';
test('Revertir bóveda: transacciones válidas para el codec', () => {
  const a = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
  for (const tx of [buildEnableMaster(a), buildRemoveSignerList(a), buildClearFlag(a, 15)]) {
    const t: any = { ...tx, Fee: '12', Sequence: 1, SigningPubKey: '' };
    assert.deepEqual(decode(encode(t)), t);
  }
  assert.equal((buildRemoveSignerList(a) as any).SignerEntries, undefined);
});

import { serializeBackup, parseBackup, inspectBackup, mergeBackup } from '../src/core/backup';
import { randomBytes } from 'node:crypto';
test('Respaldo: exporta sin datos de cada teléfono, cifra con contraseña y une sin duplicar', async () => {
  const addr = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
  const data: any = {
    devices: [{ id: 'd1', kind: 'ledger', label: 'Ledger', address: addr, publicKey: '02ab', createdAt: 1, ledger: { path: "44'/144'/0'/0/0", deviceId: 'BLE-123', deviceName: 'Nano X' } }],
    accounts: [{ id: 'a1', label: 'Bóveda', kind: 'vault', network: 'testnet', address: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', createdAt: 1 }],
    contacts: [],
    proposals: [],
    settings: { fiat: 'eur', validityMinutes: 120, hideBalances: false, lockEnabled: true, onboarded: true },
  };
  const random = (n: number) => new Uint8Array(randomBytes(n));
  const plain = await serializeBackup(data, { random });
  assert.ok(!plain.includes('BLE-123'));
  assert.ok(!plain.includes('lockEnabled'));
  assert.equal(inspectBackup(plain).encrypted, false);
  const back = await parseBackup(plain);
  assert.equal(back.accounts[0].label, 'Bóveda');
  assert.equal(back.settings.fiat, 'eur');

  const enc = await serializeBackup(data, { random, password: 'clave segura' });
  assert.ok(!enc.includes('Bóveda') && !enc.includes(addr));
  assert.equal(inspectBackup(enc).encrypted, true);
  await assert.rejects(parseBackup(enc), /contraseña/);
  await assert.rejects(parseBackup(enc, 'otra'), /incorrecta/);
  assert.equal((await parseBackup(enc, 'clave segura')).devices[0].address, addr);

  const m = mergeBackup({ devices: back.devices, accounts: [], contacts: [], proposals: [] }, back);
  assert.deepEqual(m.added, { devices: 0, accounts: 1, contacts: 0, proposals: 0 });
  assert.throws(() => inspectBackup('{"hola":1}'), /no es un respaldo/);
});
