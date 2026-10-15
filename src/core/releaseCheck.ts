/**
 * Comprobación periódica de la app instalada contra el registro de versiones del XRP Ledger.
 * Solo avisa: nunca bloquea. Lógica pura (sin React ni plataforma) para poder probarla.
 */
import type { ReleaseStatus } from './releases';

export type ReleaseCheckState =
  /** Registrada por el Consejo y sin validaciones fallidas. */
  | 'ok'
  /** No está en el registro (build de prueba o app modificada). */
  | 'unregistered'
  /** La misma versión está registrada con otra huella: no es la app publicada. */
  | 'mismatch'
  /** El Consejo retiró esta versión. */
  | 'revoked'
  /** Registrada, pero algún validador reportó que no coincide. */
  | 'disputed'
  /** No se pudo consultar (sin internet, nodo caído). */
  | 'unknown'
  /** Build de desarrollo: no hay huella que comprobar. */
  | 'dev';

/** Cada cuánto se vuelve a consultar el registro. */
export const RELEASE_CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
/** Si falló la consulta, reintento más pronto. */
export const RELEASE_RETRY_MS = 15 * 60 * 1000;

export function classifyRelease(s: ReleaseStatus): ReleaseCheckState {
  if (s.revoked) return 'revoked';
  if (!s.release) return s.sameVersionOther.length ? 'mismatch' : 'unregistered';
  if (s.fail.length > 0) return 'disputed';
  return 'ok';
}

/** Estados en que conviene pedir confirmación antes de firmar en mainnet. */
export function needsSignConfirm(state: ReleaseCheckState): boolean {
  return state === 'unregistered' || state === 'mismatch' || state === 'revoked' || state === 'disputed';
}

/** ¿Toca volver a consultar? */
export function isStale(lastCheck: number | null, state: ReleaseCheckState | null, now: number): boolean {
  if (lastCheck === null || state === null) return true;
  const every = state === 'unknown' ? RELEASE_RETRY_MS : RELEASE_CHECK_EVERY_MS;
  return now - lastCheck >= every;
}
