/**
 * Recordatorio periódico: cada cierto tiempo Quorum vuelve a pedir que confirmes que
 * entiendes lo esencial de la autocustodia, y revisa si tu configuración está respaldada.
 */

/** Cada cuántos días se vuelve a pedir la confirmación. */
export const REVIEW_EVERY_DAYS = 30;
/** Después de cuántos días un respaldo se considera viejo. */
export const BACKUP_STALE_DAYS = 30;

const DAY = 24 * 60 * 60 * 1000;

/** Huella de lo que guarda un respaldo (cuentas, dispositivos y contactos), para saber si cambió. */
export function configFingerprint(d: { accounts: unknown[]; devices: unknown[]; contacts: unknown[] }): string {
  const s = JSON.stringify([d.accounts, d.devices, d.contacts]);
  // djb2: basta para detectar cambios; no es criptográfico ni necesita serlo
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${s.length.toString(36)}-${(h >>> 0).toString(36)}`;
}

/** ¿Toca mostrar el recordatorio? */
export function needsReview(s: { reviewedAt?: number }, now: number): boolean {
  return now - (s.reviewedAt ?? 0) >= REVIEW_EVERY_DAYS * DAY;
}

export type BackupState =
  | { kind: 'empty' } // no hay nada que respaldar todavía
  | { kind: 'never' }
  | { kind: 'changed'; days: number } // hay cambios desde el último respaldo
  | { kind: 'old'; days: number }
  | { kind: 'ok'; days: number };

export function backupState(
  s: { backupAt?: number; backupHash?: string },
  current: { fingerprint: string; empty: boolean },
  now: number,
): BackupState {
  if (current.empty) return { kind: 'empty' };
  if (!s.backupAt) return { kind: 'never' };
  const days = Math.max(0, Math.floor((now - s.backupAt) / DAY));
  if (s.backupHash !== current.fingerprint) return { kind: 'changed', days };
  if (days >= BACKUP_STALE_DAYS) return { kind: 'old', days };
  return { kind: 'ok', days };
}
