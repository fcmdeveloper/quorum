/**
 * Armado de transacciones de la bóveda y combinación de firmas.
 * Todo aquí es puro y testeable sin red ni dispositivos.
 */
import { decodeAccountID, isValidClassicAddress } from 'ripple-address-codec';
import { locale, t } from '../i18n';
import { encode, decode } from 'ripple-binary-codec';
import { hashes } from 'xrpl';
import { Asset, amountOf, assetSymbol, isXrp, readAmount } from './assets';
import { multisignHash, singleSignHash, verifyDer, addressFromPublicKey, compressPublicKey } from './crypto';

export type TxJson = Record<string, any>;

export interface SignerSig {
  Account: string;
  SigningPubKey: string;
  TxnSignature: string;
}

export interface SignerEntryInput {
  account: string;
  weight: number;
}

export const ACCOUNT_FLAGS = {
  lsfDisableMaster: 0x00100000,
  lsfDisallowIncomingNFTokenOffer: 0x04000000,
  lsfDisallowIncomingCheck: 0x08000000,
  lsfDisallowIncomingPayChan: 0x10000000,
  lsfDisallowIncomingTrustline: 0x20000000,
} as const;

export const ACCOUNT_SET = {
  asfDisableMaster: 4,
  asfDisallowIncomingNFTokenOffer: 12,
  asfDisallowIncomingCheck: 13,
  asfDisallowIncomingPayChan: 14,
  asfDisallowIncomingTrustline: 15,
} as const;

/** Banderas que bloquean todo lo entrante salvo pagos: el endurecimiento de una bóveda. */
export const HARDENING: { asf: number; lsf: number; label: string }[] = [
  { asf: ACCOUNT_SET.asfDisallowIncomingTrustline, lsf: ACCOUNT_FLAGS.lsfDisallowIncomingTrustline, label: 'Bloquear líneas de confianza entrantes' },
  { asf: ACCOUNT_SET.asfDisallowIncomingCheck, lsf: ACCOUNT_FLAGS.lsfDisallowIncomingCheck, label: 'Bloquear cheques entrantes' },
  { asf: ACCOUNT_SET.asfDisallowIncomingNFTokenOffer, lsf: ACCOUNT_FLAGS.lsfDisallowIncomingNFTokenOffer, label: 'Bloquear ofertas de NFT entrantes' },
  { asf: ACCOUNT_SET.asfDisallowIncomingPayChan, lsf: ACCOUNT_FLAGS.lsfDisallowIncomingPayChan, label: 'Bloquear canales de pago entrantes' },
];

export function buildSetFlag(account: string, asf: number): TxJson {
  assertAddress(account, 'Cuenta');
  return { TransactionType: 'AccountSet', Account: account, SetFlag: asf };
}

/** Tickets: permiten varias propuestas pendientes en paralelo sin chocar por Sequence. */
export function buildTicketCreate(account: string, count: number): TxJson {
  assertAddress(account, 'Cuenta');
  if (!Number.isInteger(count) || count < 1 || count > 250) throw new Error('Cantidad de tickets inválida (1–250)');
  return { TransactionType: 'TicketCreate', Account: account, TicketCount: count };
}

/** Convierte XRP (texto, admite coma) a drops como string entero. */
export function xrpToDrops(xrp: string): string {
  const v = xrp.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(v)) throw new Error('Monto inválido (máximo 6 decimales)');
  const [ent, dec = ''] = v.split('.');
  const drops = BigInt(ent) * 1_000_000n + BigInt((dec + '000000').slice(0, 6));
  if (drops <= 0n) throw new Error('El monto debe ser mayor a cero');
  return drops.toString();
}

export function dropsToXrp(drops: string | number): string {
  const d = BigInt(drops);
  const ent = d / 1_000_000n;
  const dec = (d % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return dec ? `${ent}.${dec}` : `${ent}`;
}

function assertAddress(a: string, label: string) {
  if (!isValidClassicAddress(a)) throw new Error(t('{x}: dirección inválida ({a})', { x: label, a: a || t('vacía') }));
}

export function buildPayment(vault: string, destination: string, amountXrp: string, destinationTag?: string, memo?: string): TxJson {
  assertAddress(vault, 'Bóveda');
  assertAddress(destination, 'Destino');
  if (destination === vault) throw new Error('El destino no puede ser la misma bóveda');
  const tx: TxJson = {
    TransactionType: 'Payment',
    Account: vault,
    Destination: destination,
    Amount: xrpToDrops(amountXrp),
  };
  if (destinationTag && destinationTag.trim() !== '') {
    const tag = Number(destinationTag);
    if (!Number.isInteger(tag) || tag < 0 || tag > 0xffffffff) throw new Error('Destination tag inválido');
    tx.DestinationTag = tag;
  }
  if (memo && memo.trim()) {
    tx.Memos = [{ Memo: { MemoData: Buffer.from(memo.trim(), 'utf8').toString('hex').toUpperCase() } }];
  }
  return tx;
}

const toHex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();

/** Textos de los memos de una transacción (para mostrarlos antes de firmar). */
export function memoTexts(tx: TxJson): { type?: string; text: string }[] {
  const out: { type?: string; text: string }[] = [];
  for (const m of (tx.Memos as any[]) ?? []) {
    const d = m?.Memo?.MemoData;
    if (typeof d !== 'string') continue;
    try {
      const text = Buffer.from(d, 'hex').toString('utf8');
      const type = m.Memo.MemoType ? Buffer.from(m.Memo.MemoType, 'hex').toString('utf8') : undefined;
      out.push({ type, text });
    } catch {}
  }
  return out;
}

export const DONATION_MEMO = { message: 'quorum/donation', name: 'quorum/name' } as const;
export const DONATION_LIMITS = { message: 200, name: 40 } as const;

/**
 * Donación a Quorum: un pago con un mensaje y un nombre opcionales, en memos públicos
 * (los muestra quorumxrpl.com/donaciones).
 */
export function buildDonation(
  from: string,
  to: string,
  amountXrp: string,
  opts: { tag?: string; message?: string; name?: string } = {},
): TxJson {
  const tx = buildPayment(from, to, amountXrp, opts.tag);
  const message = (opts.message ?? '').trim().slice(0, DONATION_LIMITS.message) || 'Donación a Quorum';
  const name = (opts.name ?? '').trim().slice(0, DONATION_LIMITS.name);
  const memos: any[] = [{ Memo: { MemoType: toHex(DONATION_MEMO.message), MemoFormat: toHex('text/plain'), MemoData: toHex(message) } }];
  if (name) memos.push({ Memo: { MemoType: toHex(DONATION_MEMO.name), MemoFormat: toHex('text/plain'), MemoData: toHex(name) } });
  tx.Memos = memos;
  return tx;
}

/**
 * SignerListSet. Valida las mismas reglas que el ledger para no gastar fees en errores:
 * 1–32 firmantes, sin duplicados, sin la propia cuenta, quórum alcanzable.
 */
export function buildSignerListSet(vault: string, quorum: number, entries: SignerEntryInput[]): TxJson {
  assertAddress(vault, 'Bóveda');
  if (entries.length < 1 || entries.length > 32) throw new Error('La lista debe tener entre 1 y 32 firmantes');
  const seen = new Set<string>();
  for (const e of entries) {
    assertAddress(e.account, 'Firmante');
    if (e.account === vault) throw new Error('La bóveda no puede ser firmante de sí misma');
    if (seen.has(e.account)) throw new Error(t('Firmante duplicado: {a}', { a: e.account }));
    seen.add(e.account);
    if (!Number.isInteger(e.weight) || e.weight < 1 || e.weight > 65535) throw new Error('Peso inválido (1–65535)');
  }
  const total = entries.reduce((a, e) => a + e.weight, 0);
  if (!Number.isInteger(quorum) || quorum < 1) throw new Error('Quórum inválido');
  if (quorum > total) throw new Error(t('Quórum {q} inalcanzable: la suma de pesos es {n}', { q: quorum, n: total }));
  return {
    TransactionType: 'SignerListSet',
    Account: vault,
    SignerQuorum: quorum,
    SignerEntries: entries.map((e) => ({ SignerEntry: { Account: e.account, SignerWeight: e.weight } })),
  };
}

/** SignerListSet con quórum 0 y sin entradas = eliminar la lista. */
export function buildDeleteSignerList(vault: string): TxJson {
  assertAddress(vault, 'Bóveda');
  return { TransactionType: 'SignerListSet', Account: vault, SignerQuorum: 0 };
}

export function buildDisableMaster(vault: string): TxJson {
  assertAddress(vault, 'Bóveda');
  return { TransactionType: 'AccountSet', Account: vault, SetFlag: ACCOUNT_SET.asfDisableMaster };
}

export function buildEnableMaster(vault: string): TxJson {
  assertAddress(vault, 'Bóveda');
  return { TransactionType: 'AccountSet', Account: vault, ClearFlag: ACCOUNT_SET.asfDisableMaster };
}

export function buildClearFlag(account: string, asf: number): TxJson {
  assertAddress(account, 'Cuenta');
  return { TransactionType: 'AccountSet', Account: account, ClearFlag: asf };
}

/** SignerListSet con quórum 0 y sin entradas = borrar la lista de firmantes. */
export function buildRemoveSignerList(vault: string): TxJson {
  assertAddress(vault, 'Bóveda');
  return { TransactionType: 'SignerListSet', Account: vault, SignerQuorum: 0 };
}

/** SetRegularKey sin RegularKey = quitar la clave regular. */
export function buildRemoveRegularKey(vault: string): TxJson {
  assertAddress(vault, 'Bóveda');
  return { TransactionType: 'SetRegularKey', Account: vault };
}

/**
 * Deja la transacción lista para firmar en paralelo: SigningPubKey vacío y sin firmas previas.
 * Sequence, Fee y LastLedgerSequence deben venir ya fijados (ver network.ts → prepareForSigning).
 */
export function normalizeForMultisign(tx: TxJson): TxJson {
  const { Signers, TxnSignature, ...rest } = tx;
  for (const f of ['Sequence', 'Fee']) {
    if (rest[f] === undefined) throw new Error(t('Falta {x}: la transacción no fue preparada', { x: f }));
  }
  return { ...rest, SigningPubKey: '' };
}

function accountIdHex(address: string): string {
  return Buffer.from(decodeAccountID(address)).toString('hex');
}

/** Verifica que la firma de un firmante corresponda a esta transacción exacta. */
export function verifySignerSig(tx: TxJson, sig: SignerSig): boolean {
  if (addressFromPublicKey(sig.SigningPubKey) !== sig.Account) {
    // Una cuenta firmante con clave regular tendría otra dirección; este sistema
    // solo usa claves maestras de dispositivos, así que exigimos coincidencia.
    return false;
  }
  return verifyDer(sig.TxnSignature, multisignHash(normalizeForMultisign(tx), sig.Account), sig.SigningPubKey);
}

/**
 * Combina las firmas en el campo Signers (ordenadas por AccountID numérico, como exige el ledger).
 * Rechaza firmas inválidas, duplicadas o de cuentas que no están en la lista.
 */
export function combineSignatures(
  tx: TxJson,
  sigs: SignerSig[],
  signerList?: { quorum: number; entries: SignerEntryInput[] },
): { tx: TxJson; blob: string; hash: string; weight: number } {
  const base = normalizeForMultisign(tx);
  const unique = new Map<string, SignerSig>();
  for (const s of sigs) {
    if (unique.has(s.Account)) continue;
    if (!verifySignerSig(base, s)) throw new Error(t('La firma de {a} no es válida para esta transacción', { a: s.Account }));
    unique.set(s.Account, { ...s, SigningPubKey: compressPublicKey(s.SigningPubKey), TxnSignature: s.TxnSignature.toUpperCase() });
  }
  let weight = 0;
  if (signerList) {
    const weights = new Map(signerList.entries.map((e) => [e.account, e.weight]));
    for (const acc of unique.keys()) {
      const w = weights.get(acc);
      if (w === undefined) throw new Error(t('{a} no está en la lista de firmantes de la bóveda', { a: acc }));
      weight += w;
    }
    if (weight < signerList.quorum) throw new Error(t('Peso acumulado {w} menor que el quórum {q}', { w: weight, q: signerList.quorum }));
  }
  const sorted = [...unique.values()].sort((a, b) => {
    const x = accountIdHex(a.Account);
    const y = accountIdHex(b.Account);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  const finalTx = { ...base, Signers: sorted.map((s) => ({ Signer: s })) };
  const blob = encode(finalTx as any);
  return { tx: finalTx, blob, hash: hashes.hashSignedTx(blob), weight };
}

/** Arma una transacción con firma simple (para la configuración inicial con la master key). */
export function attachSingleSignature(tx: TxJson, pubKey: string, sigDer: string): { tx: TxJson; blob: string; hash: string } {
  const { Signers, TxnSignature, ...rest } = tx;
  const withKey: TxJson = { ...rest, SigningPubKey: compressPublicKey(pubKey) };
  if (addressFromPublicKey(pubKey) !== withKey.Account) {
    throw new Error('La clave que firmó no es la clave maestra de la bóveda');
  }
  if (!verifyDer(sigDer, singleSignHash(withKey), pubKey)) throw new Error('Firma simple inválida');
  const finalTx = { ...withKey, TxnSignature: sigDer.toUpperCase() };
  const blob = encode(finalTx as any);
  return { tx: finalTx, blob, hash: hashes.hashSignedTx(blob) };
}

/**
 * Acepta una transacción firmada por Xaman en modo simple. Xaman puede ajustar la
 * comisión, la secuencia, la ventana de validez o agregar el flag de firma canónica antes
 * de firmar; todo lo demás (tipo, cuenta, destino, monto, flags de cuenta…) debe ser
 * idéntico a lo que se propuso. Verifica la firma sobre lo que realmente se firmó.
 */
const XAMAN_MAY_CHANGE = new Set(['Fee', 'Sequence', 'LastLedgerSequence', 'SigningPubKey', 'TxnSignature', 'Signers', 'NetworkID', 'Flags']);
const TF_FULLY_CANONICAL = 0x80000000;
export const MAX_XAMAN_FEE_DROPS = 2_000_000; // 2 XRP: tope de seguridad

export function acceptXamanSigned(proposed: TxJson, signedHex: string): { tx: TxJson; blob: string; hash: string } {
  const signed = decode(signedHex) as TxJson;
  // Se comparan en forma canónica (pasando por el codec binario): "5.0" y "5", o
  // "0.10" y "0.1", son el mismo monto aunque el texto sea distinto.
  const canon = (t: TxJson) => {
    const { Signers, TxnSignature, ...rest } = t;
    return decode(encode({ ...rest, SigningPubKey: '' } as any)) as TxJson;
  };
  const a = canon(proposed);
  const b = canon(signed);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (XAMAN_MAY_CHANGE.has(k)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) {
      const show = (v: unknown) => (typeof v === 'object' ? JSON.stringify(v) : String(v));
      throw new Error(t('Xaman firmó una transacción distinta a la propuesta (campo {k}: se propuso {a}, Xaman firmó {b})', { k, a: show(a[k]), b: show(b[k]) }));
    }
  }
  const f0 = ((proposed.Flags ?? 0) as number) >>> 0;
  const f1 = ((signed.Flags ?? 0) as number) >>> 0;
  if ((f0 | TF_FULLY_CANONICAL) >>> 0 !== (f1 | TF_FULLY_CANONICAL) >>> 0) throw new Error('Xaman cambió los flags de la transacción');
  if (Number(signed.Fee) > MAX_XAMAN_FEE_DROPS) throw new Error(t('Comisión demasiado alta ({x} XRP)', { x: dropsToXrp(String(signed.Fee)) }));
  if (!signed.TxnSignature || !signed.SigningPubKey) throw new Error('Xaman no devolvió una firma simple');
  const pub = compressPublicKey(signed.SigningPubKey);
  const { TxnSignature, ...unsigned } = signed;
  if (!verifyDer(TxnSignature, singleSignHash({ ...unsigned, SigningPubKey: signed.SigningPubKey }), pub)) {
    throw new Error('La firma de Xaman no corresponde a la transacción');
  }
  const blob = encode(signed as any);
  return { tx: signed, blob, hash: hashes.hashSignedTx(blob) };
}

/** Extrae la firma de un firmante desde un blob firmado (p. ej. el que devuelve Xaman). */
export function signerSigFromBlob(hex: string, expectedAccount?: string): SignerSig {
  const t = decode(hex) as TxJson;
  const list: SignerSig[] = (t.Signers ?? []).map((x: any) => x.Signer);
  const s = expectedAccount ? list.find((x) => x.Account === expectedAccount) : list[0];
  if (!s) throw new Error('El blob no contiene la firma esperada');
  return s;
}

/** Resumen legible de una transacción para mostrar antes de firmar. */
export function describeTx(tx: TxJson, net?: any): { title: string; lines: [string, string][] } {
  const trade = describeTradeTx(tx, net);
  if (trade) {
    const out: [string, string][] = [['Cuenta', tx.Account], ...trade.lines];
    if (tx.Fee) out.push(['Comisión', `${Number(dropsToXrp(tx.Fee)).toLocaleString(locale(), { maximumFractionDigits: 6 })} XRP`]);
    if (tx.TicketSequence !== undefined) out.push(['Ticket', String(tx.TicketSequence)]);
    else if (tx.Sequence !== undefined) out.push(['Secuencia', String(tx.Sequence)]);
    return { title: trade.title, lines: out };
  }
  const lines: [string, string][] = [['Cuenta', tx.Account]];
  let title: string = tx.TransactionType;
  switch (tx.TransactionType) {
    case 'Payment':
      title = 'Pago';
      lines.push(['Destino', tx.Destination]);
      lines.push(['Monto', typeof tx.Amount === 'string' ? `${dropsToXrp(tx.Amount)} XRP` : JSON.stringify(tx.Amount)]);
      if (tx.DestinationTag !== undefined) lines.push(['Destination tag', String(tx.DestinationTag)]);
      for (const m of memoTexts(tx)) lines.push([m.type === DONATION_MEMO.name ? 'Nombre' : 'Memo', m.text]);
      break;
    case 'SignerListSet':
      if (!tx.SignerEntries || tx.SignerQuorum === 0) {
        title = 'Eliminar lista de firmantes';
      } else {
        title = 'Configurar lista de firmantes';
        lines.push(['Quórum', String(tx.SignerQuorum)]);
        tx.SignerEntries.forEach((e: any, i: number) =>
          lines.push([t('Firmante {n}', { n: i + 1 }), t('{a} (peso {w})', { a: e.SignerEntry.Account, w: e.SignerEntry.SignerWeight })]),
        );
      }
      break;
    case 'AccountSet':
      if (tx.SetFlag === ACCOUNT_SET.asfDisableMaster) title = 'Desactivar master key';
      else if (tx.ClearFlag === ACCOUNT_SET.asfDisableMaster) title = 'Reactivar master key';
      else {
        const h = HARDENING.find((x) => x.asf === tx.SetFlag);
        if (h) title = h.label;
      }
      break;
    case 'TicketCreate':
      title = 'Crear tickets';
      lines.push(['Cantidad', String(tx.TicketCount)]);
      break;
    case 'SetRegularKey':
      title = tx.RegularKey ? 'Asignar clave regular' : 'Quitar clave regular';
      if (tx.RegularKey) lines.push(['Clave regular', tx.RegularKey]);
      break;
  }
  if (tx.Fee) lines.push(['Comisión', `${Number(dropsToXrp(tx.Fee)).toLocaleString(locale(), { maximumFractionDigits: 6 })} XRP`]);
  if (tx.TicketSequence !== undefined) lines.push(['Ticket', String(tx.TicketSequence)]);
  else if (tx.Sequence !== undefined) lines.push(['Secuencia', String(tx.Sequence)]);
  if (tx.LastLedgerSequence !== undefined) lines.push(['Válida hasta ledger', String(tx.LastLedgerSequence)]);
  return { title, lines };
}

// ───────────────────────────── Tokens, swap y DEX ─────────────────────────────


export const OFFER_FLAGS = {
  tfPassive: 0x00010000,
  tfImmediateOrCancel: 0x00020000,
  tfFillOrKill: 0x00040000,
  tfSell: 0x00080000,
} as const;

export const TRUST_FLAGS = {
  tfSetNoRipple: 0x00020000,
} as const;

/** Habilita un token: línea de confianza con NoRipple (lo correcto para cuentas que no son emisoras). */
export function buildTrustSet(account: string, token: { currency: string; issuer: string }, limit = '1000000000'): TxJson {
  assertAddress(account, 'Cuenta');
  assertAddress(token.issuer, 'Emisor');
  return {
    TransactionType: 'TrustSet',
    Account: account,
    LimitAmount: { currency: token.currency, issuer: token.issuer, value: limit },
    Flags: TRUST_FLAGS.tfSetNoRipple,
  };
}

/** Quitar un token (solo si el saldo es 0): límite 0. */
export function buildRemoveTrust(account: string, token: { currency: string; issuer: string }): TxJson {
  return { ...buildTrustSet(account, token, '0') };
}

/** Pago en XRP o en token. Si el emisor cobra comisión de transferencia, se agrega SendMax. */
export function buildAssetPayment(
  from: string,
  to: string,
  asset: Asset,
  value: string,
  opts: { tag?: string; memo?: string; transferRate?: number } = {},
): TxJson {
  if (isXrp(asset)) return buildPayment(from, to, value, opts.tag, opts.memo);
  const base = buildPayment(from, to, '1', opts.tag, opts.memo);
  const amt = amountOf(asset, value) as any;
  base.Amount = amt;
  const rate = opts.transferRate ?? 1;
  if (rate > 1 && from !== asset.issuer && to !== asset.issuer) {
    base.SendMax = { ...amt, value: (amountOf(asset, Number(amt.value) * rate * 1.000001) as any).value };
  }
  return base;
}

/**
 * Swap: vende exactamente `amountIn` de `from` y exige recibir al menos `minOut` de `to`.
 * Se ejecuta completo o no se ejecuta (Fill-or-Kill), contra el libro y los AMM del ledger.
 */
export function buildSwap(account: string, from: Asset, amountIn: number, to: Asset, minOut: number): TxJson {
  assertAddress(account, 'Cuenta');
  return {
    TransactionType: 'OfferCreate',
    Account: account,
    TakerGets: amountOf(from, amountIn),
    TakerPays: amountOf(to, minOut),
    Flags: OFFER_FLAGS.tfSell | OFFER_FLAGS.tfFillOrKill,
  };
}

/** Orden límite en el DEX sobre el par base/quote, precio = quote por 1 base. */
export function buildLimitOrder(account: string, side: 'buy' | 'sell', base: Asset, quote: Asset, amountBase: number, price: number): TxJson {
  assertAddress(account, 'Cuenta');
  if (!(amountBase > 0) || !(price > 0)) throw new Error('Cantidad y precio deben ser mayores a cero');
  const quoteAmt = amountBase * price;
  return side === 'sell'
    ? { TransactionType: 'OfferCreate', Account: account, TakerGets: amountOf(base, amountBase), TakerPays: amountOf(quote, quoteAmt) }
    : { TransactionType: 'OfferCreate', Account: account, TakerGets: amountOf(quote, quoteAmt), TakerPays: amountOf(base, amountBase) };
}

export function buildOfferCancel(account: string, offerSequence: number): TxJson {
  assertAddress(account, 'Cuenta');
  return { TransactionType: 'OfferCancel', Account: account, OfferSequence: offerSequence };
}

function amtText(x: any, net?: any): string {
  if (x == null) return '';
  const n = readAmount(x);
  const sym = typeof x === 'string' ? 'XRP' : assetSymbol({ currency: x.currency, issuer: x.issuer }, net);
  return `${n.toLocaleString(locale(), { maximumFractionDigits: 6 })} ${sym}`;
}

/** Descripción para tokens/DEX (complementa describeTx). */
export function describeTradeTx(tx: TxJson, net?: any): { title: string; lines: [string, string][] } | null {
  switch (tx.TransactionType) {
    case 'TrustSet': {
      const sym = assetSymbol({ currency: tx.LimitAmount.currency, issuer: tx.LimitAmount.issuer }, net);
      const off = tx.LimitAmount.value === '0';
      return { title: off ? t('Quitar {x}', { x: sym }) : t('Habilitar {x}', { x: sym }), lines: [['Token', sym], ['Emisor', tx.LimitAmount.issuer]] };
    }
    case 'OfferCreate': {
      const swap = (tx.Flags ?? 0) & OFFER_FLAGS.tfFillOrKill;
      return swap
        ? { title: 'Swap', lines: [['Entregas', amtText(tx.TakerGets, net)], ['Recibes al menos', amtText(tx.TakerPays, net)]] }
        : { title: 'Orden en el DEX', lines: [['Entregas', amtText(tx.TakerGets, net)], ['A cambio de', amtText(tx.TakerPays, net)]] };
    }
    case 'OfferCancel':
      return { title: 'Cancelar orden', lines: [['Orden', `#${tx.OfferSequence}`]] };
    case 'Payment':
      if (typeof tx.Amount === 'object') {
        return { title: 'Pago', lines: [['Destino', tx.Destination], ['Monto', amtText(tx.Amount, net)]] };
      }
      return null;
    default:
      return null;
  }
}
