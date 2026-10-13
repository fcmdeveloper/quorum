/**
 * Intercambio de propuestas de multifirma por código QR, sin servidor.
 *
 * El QR lleva la transacción en binario XRPL (con las firmas ya reunidas en `Signers`),
 * en base64. Cada teléfono verifica cada firma contra la transacción antes de aceptarla,
 * así que un QR alterado o malicioso no puede colar firmas falsas.
 */
import { decode, encode } from 'ripple-binary-codec';
import { bytesToHex, hexToBytes, sha512Half } from './crypto';
import { SignerSig, TxJson, normalizeForMultisign, verifySignerSig } from './tx';
import type { NetworkId } from './network';

const PREFIX = 'QRM1';

/** Identificador estable de una propuesta: hash de la transacción sin firmas. Igual en todos los teléfonos. */
export function proposalIdFor(tx: TxJson): string {
  const base = normalizeForMultisign(tx);
  return bytesToHex(sha512Half(hexToBytes(encode(base as any)))).slice(0, 16);
}

export function encodeProposalQr(network: NetworkId, tx: TxJson, sigs: SignerSig[]): string {
  const base = normalizeForMultisign(tx);
  const withSigs: TxJson = sigs.length ? { ...base, Signers: sigs.map((s) => ({ Signer: s })) } : base;
  const b64 = Buffer.from(encode(withSigs as any), 'hex').toString('base64');
  return `${PREFIX}|${network === 'mainnet' ? 'm' : 't'}|${b64}`;
}

export interface DecodedProposal {
  network: NetworkId;
  tx: TxJson;
  signatures: SignerSig[];
  id: string;
}

export function isProposalQr(text: string): boolean {
  return text.startsWith(PREFIX + '|');
}

export function decodeProposalQr(text: string): DecodedProposal {
  const parts = text.trim().split('|');
  if (parts.length !== 3 || parts[0] !== PREFIX) throw new Error('Este QR no es una propuesta de Quorum');
  const network: NetworkId = parts[1] === 'm' ? 'mainnet' : 'testnet';
  const hex = Buffer.from(parts[2], 'base64').toString('hex').toUpperCase();
  const decoded = decode(hex) as TxJson;
  const { Signers, ...rest } = decoded;
  const tx = normalizeForMultisign(rest);
  const signatures: SignerSig[] = (Signers ?? []).map((x: any) => x.Signer as SignerSig);
  for (const s of signatures) {
    if (!verifySignerSig(tx, s)) throw new Error(`El QR trae una firma inválida de ${s.Account}`);
  }
  return { network, tx, signatures, id: proposalIdFor(tx) };
}

/** Une firmas sin duplicar cuentas. */
export function mergeSigs(a: SignerSig[], b: SignerSig[]): SignerSig[] {
  const m = new Map(a.map((s) => [s.Account, s]));
  for (const s of b) if (!m.has(s.Account)) m.set(s.Account, s);
  return [...m.values()];
}

/** Dirección XRPL o URI de pago (xrpl:, ripple:, https://xrpl.to/...) a dirección + tag. */
export function parseAddressQr(text: string): { address: string; tag?: string } | null {
  const t = text.trim();
  const m = t.match(/(r[1-9A-HJ-NP-Za-km-z]{24,34})/);
  if (!m) return null;
  const tag = t.match(/(?:dt|tag|DestinationTag)=(\d+)/i)?.[1];
  return { address: m[1], tag };
}
