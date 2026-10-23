import { clearSavedTangemCodes } from '../modules/tangem-nfc';
/**
 * Persistencia local. NUNCA se guarda una clave privada:
 * solo direcciones, claves públicas, propuestas, contactos y ajustes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import type { PinRecord } from './core/appPin';
import { SignerDevice } from './signers/types';
import { NetworkId } from './core/network';
import { TxJson, SignerSig } from './core/tx';
import { XamanCreds } from './signers/xaman';
import { Fiat, normalizeFiat } from './core/market';

export type AccountKind = 'vault' | 'wallet';

export interface Account {
  id: string;
  label: string;
  kind: AccountKind;
  network: NetworkId;
  address: string;
  createdAt: number;
  /** Color elegido para reconocerla (clave de ACCOUNT_COLORS). */
  color?: string;
  /** Ícono elegido (clave de ACCOUNT_ICONS); sin él se usa el del tipo de cuenta. */
  icon?: string;
  /**
   * NFT elegido como imagen (de cualquiera de las cuentas en Quorum). Es solo decorativo:
   * si el NFT ya no está en ninguna de tus cuentas, se quita y vuelve el ícono.
   * `pinned`: viene del NFT fijado en el XRP Ledger (core/pin.ts) y se sigue al ledger.
   */
  nft?: { id: string; image: string; network: NetworkId; name?: string; gallery?: boolean; pinned?: boolean };
  /**
   * Último NFT fijado en el XRP Ledger (WalletLocator) que vio este teléfono ('' = ninguno).
   * Si en el ledger cambia (alguien lo fijó desde otro teléfono), manda sobre la elección propia.
   */
  pinSeen?: string;
  /** true: no se suma al patrimonio total de Inicio ni al gráfico. */
  excluded?: boolean;
  /** true: oculta en Inicio (y por eso tampoco suma al patrimonio ni al gráfico). Se muestra en Orden y visibilidad. */
  hidden?: boolean;
  /** Solo bóvedas: destinos permitidos (fuera de esta lista la app exige confirmación reforzada). */
  allowed?: string[];
  /**
   * 'quorum': bóveda creada desde cero en Quorum con números secretos que la app no guarda.
   * Regla de Quorum: no puede volver a cuenta normal ni ser firmante de otra bóveda.
   */
  origin?: 'quorum';
}

export interface Contact {
  id: string;
  label: string;
  address: string;
  tag?: string;
}

export interface Settings {
  fiat: Fiat;
  validityMinutes: number;
  lockEnabled: boolean;
  /** Segundos fuera de la app antes de pedir Face ID de nuevo (0 = siempre). */
  lockAfterSec: number;
  /** Cómo se desbloquea: Face ID (o el código del teléfono) o un código de 4 dígitos propio de Quorum. */
  lockMethod?: 'faceid' | 'pin';
  /** Vibraciones de la app (toques, confirmaciones, desbloqueo). */
  haptics: boolean;
  /** Apariencia: sistema, oscuro o claro. */
  appearance: 'system' | 'dark' | 'light';
  /** Idioma: el del sistema, español o inglés. */
  language: 'system' | 'es' | 'en';
  onboarded: boolean;
  /** Versión del aviso de responsabilidad aceptada (0 = ninguna). */
  termsAccepted: number;
  hideBalances: boolean;
  /** Cómo se muestran los saldos en Inicio: en la divisa (XRP + stablecoins) o en XRP. */
  balanceUnit: 'fiat' | 'xrp';
  /** iOS 26: usar los selectores nativos con Liquid Glass en vez de los de Quorum. */
  nativeSelectors?: boolean;
  /** Última vez que se confirmó el recordatorio de seguridad (ms). */
  reviewedAt?: number;
  /** Último respaldo exportado (ms) y huella de la configuración en ese momento. */
  backupAt?: number;
  backupHash?: string;
  /** Nombre que aparece al compartir una operación por mensaje (opcional, solo en este teléfono). */
  shareName?: string;
  /** Decimales de los saldos (patrimonio y cuentas; no las transacciones). 'auto': XRP hasta 6, divisa 2. */
  balanceDecimals?: 'auto' | '0' | '2' | '4' | '6';
}

export type ProposalStatus = 'collecting' | 'ready' | 'submitted' | 'failed' | 'expired';

export interface Proposal {
  /** Hash de la tx sin firmas: el mismo en todos los teléfonos. */
  id: string;
  network: NetworkId;
  account: string;
  createdAt: number;
  mode: 'multi' | 'single';
  tx: TxJson;
  signatures: SignerSig[];
  status: ProposalStatus;
  hash?: string;
  result?: string;
  /** Mensaje del nodo cuando la red la rechazó sin validarla. */
  resultMessage?: string;
  note?: string;
  /** Recibida por enlace: quién la compartió y su motivo, tal como los escribió esa persona (no verificados). */
  sharedFrom?: string;
  sharedNote?: string;
  /** Llegó de otro teléfono (QR o enlace): después de firmar hay que devolverla. */
  received?: boolean;
  /** Otro teléfono la envió primero (se reconoció en el ledger). */
  sentElsewhere?: boolean;
}

const K = {
  settings: 'q.settings.v1',
  devices: 'q.devices.v1',
  accounts: 'q.accounts.v1',
  contacts: 'q.contacts.v1',
  proposals: 'q.proposals.v1',
  xaman: 'q.xaman.v1',
  pin: 'q.pin.v1',
  pinFails: 'q.pinfails.v1',
};

export const DEFAULT_SETTINGS: Settings = {
  fiat: 'usd',
  validityMinutes: 120,
  lockEnabled: true,
  lockAfterSec: 0,
  haptics: true,
  appearance: 'system',
  language: 'system',
  onboarded: false,
  termsAccepted: 0,
  hideBalances: false,
  balanceUnit: 'fiat',
};

async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
const writeJson = (key: string, v: unknown) => AsyncStorage.setItem(key, JSON.stringify(v));

export const loadSettings = async (): Promise<Settings> => {
  const s = { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>(K.settings, {})) };
  return { ...s, fiat: normalizeFiat(s.fiat) };
};
export const saveSettings = (s: Settings) => writeJson(K.settings, s);
export const loadDevices = () => readJson<SignerDevice[]>(K.devices, []);
export const saveDevices = (s: SignerDevice[]) => writeJson(K.devices, s);
export const loadAccounts = () => readJson<Account[]>(K.accounts, []);
export const saveAccounts = (s: Account[]) => writeJson(K.accounts, s);
export const loadContacts = () => readJson<Contact[]>(K.contacts, []);
export const saveContacts = (s: Contact[]) => writeJson(K.contacts, s);
export const loadProposals = () => readJson<Proposal[]>(K.proposals, []);
export const saveProposals = (p: Proposal[]) => writeJson(K.proposals, p);

export async function loadXamanCreds(): Promise<XamanCreds | null> {
  try {
    const v = await SecureStore.getItemAsync(K.xaman);
    const c = v ? JSON.parse(v) : null;
    // formato antiguo (API key/secret del usuario): se descarta
    if (c && !c.jwt) {
      await SecureStore.deleteItemAsync(K.xaman);
      return null;
    }
    return c;
  } catch {
    return null;
  }
}

export async function saveXamanCreds(c: XamanCreds | null) {
  if (!c) return SecureStore.deleteItemAsync(K.xaman);
  return SecureStore.setItemAsync(K.xaman, JSON.stringify(c), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

/** Huella del código de 4 dígitos de la app (nunca el código). Solo este teléfono, fuera de respaldos. */
export async function loadPinRecord(): Promise<PinRecord | null> {
  try {
    const v = await SecureStore.getItemAsync(K.pin);
    return v ? (JSON.parse(v) as PinRecord) : null;
  } catch {
    return null;
  }
}
export async function savePinRecord(r: PinRecord | null) {
  if (!r) {
    await SecureStore.deleteItemAsync(K.pinFails).catch(() => {});
    return SecureStore.deleteItemAsync(K.pin);
  }
  return SecureStore.setItemAsync(K.pin, JSON.stringify(r), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
}
/** Errores seguidos del código y hasta cuándo hay que esperar (sobrevive a cerrar la app). */
export async function loadPinFails(): Promise<{ n: number; until: number }> {
  try {
    const v = await SecureStore.getItemAsync(K.pinFails);
    return v ? JSON.parse(v) : { n: 0, until: 0 };
  } catch {
    return { n: 0, until: 0 };
  }
}
export const savePinFails = (f: { n: number; until: number }) =>
  SecureStore.setItemAsync(K.pinFails, JSON.stringify(f), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });

export async function wipeAll() {
  await AsyncStorage.multiRemove(Object.values(K));
  clearSavedTangemCodes();
  try {
    await SecureStore.deleteItemAsync(K.xaman);
    await SecureStore.deleteItemAsync(K.pin);
    await SecureStore.deleteItemAsync(K.pinFails);
  } catch {}
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
