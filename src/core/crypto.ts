/**
 * Utilidades criptográficas puras (sin dependencias nativas) para armar firmas XRPL
 * a partir de dispositivos externos (Tangem entrega r||s crudo; Ledger entrega DER).
 */
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { encodeForMultisigning, encodeForSigning } from 'ripple-binary-codec';
import { deriveAddress } from 'ripple-keypairs';
import { t } from '../i18n';

const N = secp256k1.Point.CURVE().n;
const HALF_N = N >> 1n;

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') || hex.startsWith('0X') ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error('Hex inválido');
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

export function bytesToHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s.toUpperCase();
}

function bytesToBigInt(bytes: Uint8Array): bigint {
  let v = 0n;
  for (const b of bytes) v = (v << 8n) | BigInt(b);
  return v;
}

function bigIntToMinimalBytes(v: bigint): Uint8Array {
  let hex = v.toString(16);
  if (hex.length % 2) hex = '0' + hex;
  let bytes = hexToBytes(hex);
  // DER INTEGER: si el bit alto está prendido se antepone 0x00
  if (bytes[0] & 0x80) {
    const b = new Uint8Array(bytes.length + 1);
    b.set(bytes, 1);
    bytes = b;
  }
  return bytes;
}

/** SHA-512Half: los primeros 32 bytes de SHA-512, el hash que firma XRPL. */
export function sha512Half(data: Uint8Array): Uint8Array {
  return sha512(data).slice(0, 32);
}

/** Convierte una clave pública secp256k1 (33 o 65 bytes) a su forma comprimida en hex mayúscula. */
export function compressPublicKey(pubHex: string): string {
  const bytes = hexToBytes(pubHex);
  if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) return bytesToHex(bytes);
  const point = secp256k1.Point.fromBytes(bytes);
  return bytesToHex(point.toBytes(true));
}

/** Dirección clásica (r...) a partir de una clave pública secp256k1. */
export function addressFromPublicKey(pubHex: string): string {
  return deriveAddress(compressPublicKey(pubHex));
}

function parseDer(der: Uint8Array): { r: bigint; s: bigint } {
  let i = 0;
  if (der[i++] !== 0x30) throw new Error('Firma DER inválida');
  const totalLen = der[i++];
  if (totalLen + 2 !== der.length) throw new Error('Largo DER inválido');
  if (der[i++] !== 0x02) throw new Error('Firma DER inválida (r)');
  const rLen = der[i++];
  const r = bytesToBigInt(der.slice(i, i + rLen));
  i += rLen;
  if (der[i++] !== 0x02) throw new Error('Firma DER inválida (s)');
  const sLen = der[i++];
  const s = bytesToBigInt(der.slice(i, i + sLen));
  return { r, s };
}

function encodeDer(r: bigint, s: bigint): Uint8Array {
  const rb = bigIntToMinimalBytes(r);
  const sb = bigIntToMinimalBytes(s);
  const body = new Uint8Array(2 + rb.length + 2 + sb.length);
  body[0] = 0x02;
  body[1] = rb.length;
  body.set(rb, 2);
  body[2 + rb.length] = 0x02;
  body[3 + rb.length] = sb.length;
  body.set(sb, 4 + rb.length);
  const out = new Uint8Array(body.length + 2);
  out[0] = 0x30;
  out[1] = body.length;
  out.set(body, 2);
  return out;
}

/**
 * Normaliza cualquier firma secp256k1 (r||s de 64 bytes, o DER) a DER canónico con S bajo,
 * que es el único formato que acepta XRPL.
 */
export function toCanonicalDer(sigHex: string): string {
  const bytes = hexToBytes(sigHex);
  let r: bigint;
  let s: bigint;
  if (bytes.length === 64) {
    r = bytesToBigInt(bytes.slice(0, 32));
    s = bytesToBigInt(bytes.slice(32));
  } else if (bytes[0] === 0x30) {
    ({ r, s } = parseDer(bytes));
  } else {
    throw new Error(t('Formato de firma no reconocido ({n} bytes)', { n: bytes.length }));
  }
  if (r <= 0n || r >= N || s <= 0n || s >= N) throw new Error('Firma fuera de rango');
  if (s > HALF_N) s = N - s;
  return bytesToHex(encodeDer(r, s));
}

/** Hash que debe firmar un firmante de multifirma para `tx` (prefijo SMT + tx + AccountID del firmante). */
export function multisignHash(tx: Record<string, unknown>, signerAddress: string): Uint8Array {
  const data = encodeForMultisigning({ ...tx, SigningPubKey: '' } as any, signerAddress);
  return sha512Half(hexToBytes(data));
}

/** Hash para firma simple (prefijo STX + tx con SigningPubKey ya fijado). */
export function singleSignHash(tx: Record<string, unknown>): Uint8Array {
  const data = encodeForSigning(tx as any);
  return sha512Half(hexToBytes(data));
}

/** Verifica una firma DER contra un hash de 32 bytes y una clave pública. */
export function verifyDer(sigDerHex: string, hash: Uint8Array, pubHex: string): boolean {
  try {
    const sig = hexToBytes(sigDerHex);
    return secp256k1.verify(sig, hash, hexToBytes(compressPublicKey(pubHex)), {
      prehash: false,
      format: 'der',
      lowS: true,
    });
  } catch {
    return false;
  }
}
