/**
 * Código de 4 dígitos para bloquear la app (alternativa a Face ID).
 *
 * - Nunca se guarda el código: solo una huella PBKDF2-SHA256 con sal aleatoria, en el llavero
 *   del teléfono (solo este dispositivo). No sale en respaldos.
 * - 4 dígitos son pocas combinaciones: lo que lo protege es la espera creciente tras varios
 *   errores. Este bloqueo solo impide ver la app; mover fondos siempre exige las firmas.
 */
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';

export const PIN_LENGTH = 4;
export const PIN_ITER = 10_000; // rápido en el teléfono; la protección real es la espera tras errores

export interface PinRecord {
  v: 1;
  salt: string;
  hash: string;
  iter: number;
}

export const isValidPin = (pin: string) => new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

/** Códigos demasiado obvios (1111, 1234, 4321…). */
export function isWeakPin(pin: string): boolean {
  if (!isValidPin(pin)) return true;
  if (/^(\d)\1+$/.test(pin)) return true;
  const d = pin.split('').map(Number);
  const step = d[1] - d[0];
  return (step === 1 || step === -1) && d.every((x, i) => i === 0 || x - d[i - 1] === step);
}

export function hashPin(pin: string, saltHex: string, iter = PIN_ITER): string {
  const enc = new TextEncoder();
  return bytesToHex(pbkdf2(sha256, enc.encode(pin), enc.encode(saltHex), { c: iter, dkLen: 32 }));
}

export function makePinRecord(pin: string, saltHex: string): PinRecord {
  if (!isValidPin(pin)) throw new Error('El código debe tener 4 dígitos');
  return { v: 1, salt: saltHex, hash: hashPin(pin, saltHex), iter: PIN_ITER };
}

/** Comparación en tiempo constante. */
export function checkPin(pin: string, rec: PinRecord): boolean {
  if (!isValidPin(pin)) return false;
  const h = hashPin(pin, rec.salt, rec.iter);
  if (h.length !== rec.hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ rec.hash.charCodeAt(i);
  return diff === 0;
}

/**
 * Espera tras errores seguidos: los primeros 4 son gratis; después 30 s, 1 min, 5 min,
 * 15 min y 1 h como máximo. Así probar las 10.000 combinaciones tomaría meses.
 */
export function lockoutMs(failures: number): number {
  if (failures < 5) return 0;
  const steps = [30, 60, 300, 900, 3600];
  return steps[Math.min(failures - 5, steps.length - 1)] * 1000;
}
