/**
 * Bóveda creada en Quorum: una cuenta nueva cuya clave nace en el teléfono solo para
 * configurar la bóveda y que queda desactivada al final.
 *
 * La clave se muestra como "números secretos" (8 filas de 6 dígitos, el mismo formato
 * que usa Xaman). NUNCA se guarda: vive en memoria mientras se muestra o se firma, y el
 * usuario la vuelve a escribir cada vez que hace falta.
 */
import { Account as SecretAccount, checkChecksum, entropyToSecret } from '@xrplf/secret-numbers';
import { encodeForSigning } from 'ripple-binary-codec';
import { sign as keypairSign } from 'ripple-keypairs';
import { TxJson, attachSingleSignature } from './tx';

export const SECRET_ROWS = 8;
export const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** Números secretos nuevos a partir de 16 bytes del generador seguro del teléfono. */
export function generateSecret(): string[] {
  const c = (globalThis as any).crypto;
  if (!c?.getRandomValues) throw new Error('Este teléfono no tiene un generador aleatorio seguro disponible');
  const entropy = new Uint8Array(16);
  c.getRandomValues(entropy);
  // defensa mínima contra un generador roto (todo ceros o todo igual)
  if (entropy.every((b) => b === entropy[0])) throw new Error('El generador aleatorio devolvió datos inválidos');
  const rows = entropyToSecret(entropy);
  entropy.fill(0);
  return rows;
}

/** Una fila es válida si tiene 6 dígitos y su último dígito (control) coincide. */
export function rowValid(index: number, row: string): boolean {
  const v = row.trim();
  if (!/^\d{6}$/.test(v)) return false;
  try {
    return checkChecksum(index, v);
  } catch {
    return false;
  }
}

/** Dirección que corresponde a los números secretos (lanza error si alguna fila está mal). */
export function addressFromSecret(rows: string[]): string {
  return keysFromSecret(rows).address;
}

function keysFromSecret(rows: string[]): { address: string; publicKey: string; privateKey: string } {
  if (rows.length !== SECRET_ROWS) throw new Error('Faltan filas de los números secretos');
  rows.forEach((r, i) => {
    if (!rowValid(i, r)) throw new Error(`La fila ${ROW_LETTERS[i]} no es válida`);
  });
  const acc = new SecretAccount(rows.map((r) => r.trim()));
  const kp = acc.getKeypair();
  return { address: acc.getAddress(), publicKey: kp.publicKey, privateKey: kp.privateKey };
}

/**
 * Firma `tx` (ya preparada) con la clave de los números secretos. Solo firma si la clave
 * corresponde a la cuenta de la transacción, y la firma se verifica antes de devolverla.
 */
export function signWithSecret(tx: TxJson, rows: string[]): { tx: TxJson; blob: string; hash: string } {
  const k = keysFromSecret(rows);
  if (k.address !== tx.Account) throw new Error('Estos números secretos no son los de esta bóveda');
  const { Signers, TxnSignature, ...rest } = tx;
  const withKey = { ...rest, SigningPubKey: k.publicKey };
  const der = keypairSign(encodeForSigning(withKey as any), k.privateKey);
  return attachSingleSignature(tx, k.publicKey, der);
}

/** Reservas de la red en XRP (base por cuenta e incremento por objeto). */
export interface Reserves {
  base: number;
  inc: number;
}

/**
 * Lo mínimo para dejar lista una bóveda nueva: reserva de la cuenta, la lista de firmantes
 * y los tickets (si se piden), más un margen para comisiones y la prueba con multifirma.
 */
export function setupMinimumXrp(r: Reserves, tickets: number): number {
  const objects = 1 + tickets;
  return Math.ceil((r.base + r.inc * objects + 1) * 10) / 10;
}

/** Saldo a partir del cual se advierte que hay más de lo necesario antes de terminar. */
export function setupBalanceLimitXrp(r: Reserves, tickets: number): number {
  return setupMinimumXrp(r, tickets) + 5;
}

/**
 * Por qué una dirección no sirve como firmante de una bóveda (o null si sirve).
 * Un firmante firma con la clave de su propia cuenta: master key activa o clave regular.
 * Su dirección no necesita estar activada en la red.
 */
export function signerProblem(
  st: { exists: boolean; masterDisabled: boolean; regularKey: string | null; signerList: unknown } | undefined,
  createdInQuorum: boolean,
): string | null {
  if (createdInQuorum) return 'Es una bóveda creada en Quorum: su clave quedó desactivada y no puede firmar.';
  if (!st || !st.exists) return null;
  if (st.signerList) return 'Es otra bóveda (tiene su propia lista de firmantes): no puede firmar por esta.';
  if (st.masterDisabled && !st.regularKey) return 'Su master key está desactivada y no tiene clave regular: no podría firmar nunca.';
  return null;
}

/** Una bóveda creada en Quorum sigue "en preparación" mientras su master key esté activa. */
export function isPreparing(acc: { origin?: string }, st?: { exists: boolean; masterDisabled: boolean }): boolean {
  return acc.origin === 'quorum' && !st?.masterDisabled;
}
