/**
 * Respaldo de Quorum para pasar la configuración a otro teléfono.
 *
 * Incluye solo datos públicos: dispositivos (direcciones y claves públicas), cuentas,
 * contactos, operaciones y ajustes visuales. NO incluye: sesión de Xaman, códigos de
 * tarjetas Tangem, ni el bloqueo con Face ID (son propios de cada teléfono).
 *
 * Opcionalmente se cifra con contraseña (scrypt + XChaCha20-Poly1305).
 */
import { scryptAsync } from '@noble/hashes/scrypt.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import type { Account, Contact, Proposal, Settings } from '../store';
import type { SignerDevice } from '../signers/types';
import { normalizeFiat } from './market';

export const BACKUP_FORMAT = 'quorum-backup';
export const BACKUP_VERSION = 1;

export interface BackupData {
  devices: SignerDevice[];
  accounts: Account[];
  contacts: Contact[];
  proposals: Proposal[];
  settings: Pick<Settings, 'fiat' | 'validityMinutes' | 'hideBalances'>;
}

interface PlainFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  encrypted: false;
  data: BackupData;
}

interface EncryptedFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  encrypted: true;
  kdf: { alg: 'scrypt'; N: number; r: number; p: number; salt: string };
  nonce: string;
  ciphertext: string;
}

const KDF = { N: 2 ** 14, r: 8, p: 1 }; // ~16 MB: razonable en un teléfono

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => {
  if (!/^[0-9a-f]*$/i.test(s) || s.length % 2) throw new Error('Respaldo dañado');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/** Quita lo que no debe viajar a otro teléfono (p. ej. el id Bluetooth del Ledger). */
export function sanitizeForExport(d: BackupData): BackupData {
  return {
    devices: d.devices.map((x) => (x.ledger ? { ...x, ledger: { ...x.ledger, deviceId: '' } } : x)),
    accounts: d.accounts,
    contacts: d.contacts,
    proposals: d.proposals,
    settings: { fiat: d.settings.fiat, validityMinutes: d.settings.validityMinutes, hideBalances: d.settings.hideBalances },
  };
}

export async function serializeBackup(
  data: BackupData,
  opts: { password?: string; random: (n: number) => Uint8Array; now?: Date },
): Promise<string> {
  const clean = sanitizeForExport(data);
  const createdAt = (opts.now ?? new Date()).toISOString();
  if (!opts.password) {
    const f: PlainFile = { format: BACKUP_FORMAT, version: BACKUP_VERSION, createdAt, encrypted: false, data: clean };
    return JSON.stringify(f, null, 2);
  }
  const salt = opts.random(16);
  const nonce = opts.random(24);
  const key = await scryptAsync(opts.password, salt, { ...KDF, dkLen: 32 });
  const ct = xchacha20poly1305(key, nonce).encrypt(new TextEncoder().encode(JSON.stringify(clean)));
  const f: EncryptedFile = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    encrypted: true,
    kdf: { alg: 'scrypt', ...KDF, salt: hex(salt) },
    nonce: hex(nonce),
    ciphertext: hex(ct),
  };
  return JSON.stringify(f);
}

/** Lee el encabezado sin descifrar (para saber si pide contraseña). */
export function inspectBackup(text: string): { encrypted: boolean; createdAt: string } {
  let f: any;
  try {
    f = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un respaldo de Quorum');
  }
  if (f?.format !== BACKUP_FORMAT) throw new Error('El archivo no es un respaldo de Quorum');
  if (f.version > BACKUP_VERSION) throw new Error('Este respaldo es de una versión más nueva de Quorum. Actualiza la app.');
  return { encrypted: !!f.encrypted, createdAt: f.createdAt };
}

export async function parseBackup(text: string, password?: string): Promise<BackupData> {
  inspectBackup(text);
  const f = JSON.parse(text) as PlainFile | EncryptedFile;
  let data: any;
  if (f.encrypted) {
    if (!password) throw new Error('Este respaldo está protegido con contraseña');
    const { N, r, p, salt } = f.kdf;
    const key = await scryptAsync(password, unhex(salt), { N, r, p, dkLen: 32 });
    let plain: Uint8Array;
    try {
      plain = xchacha20poly1305(key, unhex(f.nonce)).decrypt(unhex(f.ciphertext));
    } catch {
      throw new Error('Contraseña incorrecta (o archivo dañado)');
    }
    data = JSON.parse(new TextDecoder().decode(plain));
  } else {
    data = f.data;
  }
  return validate(data);
}

function validate(d: any): BackupData {
  const arr = (x: any) => (Array.isArray(x) ? x : []);
  const isAddr = (a: any) => typeof a === 'string' && /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(a);
  const devices = arr(d?.devices).filter((x: any) => x && isAddr(x.address) && ['tangem', 'ledger', 'xaman'].includes(x.kind));
  const accounts = arr(d?.accounts).filter((x: any) => x && isAddr(x.address) && ['vault', 'wallet'].includes(x.kind) && ['mainnet', 'testnet'].includes(x.network));
  const contacts = arr(d?.contacts).filter((x: any) => x && isAddr(x.address));
  const proposals = arr(d?.proposals).filter((x: any) => x && typeof x.id === 'string' && x.tx && isAddr(x.account));
  const s = d?.settings ?? {};
  return {
    devices,
    accounts,
    contacts,
    proposals,
    settings: {
      fiat: normalizeFiat(s.fiat),
      validityMinutes: Number(s.validityMinutes) || 120,
      hideBalances: !!s.hideBalances,
    },
  };
}

export interface MergeResult {
  data: Omit<BackupData, 'settings'>;
  added: { devices: number; accounts: number; contacts: number; proposals: number };
}

/** Une el respaldo con lo que ya hay en el teléfono, sin duplicar ni pisar lo existente. */
export function mergeBackup(cur: Omit<BackupData, 'settings'>, inc: BackupData): MergeResult {
  const devices = [...cur.devices];
  const accounts = [...cur.accounts];
  const contacts = [...cur.contacts];
  const proposals = [...cur.proposals];
  const added = { devices: 0, accounts: 0, contacts: 0, proposals: 0 };
  for (const d of inc.devices) {
    if (devices.some((x) => x.address === d.address)) continue;
    devices.push(d);
    added.devices++;
  }
  for (const a of inc.accounts) {
    if (accounts.some((x) => x.address === a.address && x.network === a.network)) continue;
    accounts.push(a);
    added.accounts++;
  }
  for (const c of inc.contacts) {
    if (contacts.some((x) => x.address === c.address && (x.tag ?? '') === (c.tag ?? ''))) continue;
    contacts.push(c);
    added.contacts++;
  }
  for (const p of inc.proposals) {
    if (proposals.some((x) => x.id === p.id)) continue;
    proposals.push(p);
    added.proposals++;
  }
  return { data: { devices, accounts, contacts, proposals }, added };
}
