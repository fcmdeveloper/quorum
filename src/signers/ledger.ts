/**
 * Ledger Nano X / Stax / Flex por Bluetooth con la app XRP.
 * Multifirma paralela: se envía la tx con SigningPubKey vacío; el dispositivo
 * muestra todos los campos en su pantalla y firma el hash de multifirma con su propia cuenta.
 */
import TransportBLE from '@ledgerhq/react-native-hw-transport-ble';
import Xrp from '@ledgerhq/hw-app-xrp';
import { PermissionsAndroid, Platform } from 'react-native';
import { encode } from 'ripple-binary-codec';
import { compressPublicKey, toCanonicalDer } from '../core/crypto';
import { TxJson } from '../core/tx';
import { LEDGER_XRP_PATH } from './types';
import { t } from '../i18n';

export interface LedgerFound {
  id: string;
  name: string;
}

/**
 * Android 12 o más nuevo: permisos de Bluetooth "dispositivos cercanos" (Quorum declara que no usa
 * Bluetooth para ubicarte, así que no pide ubicación). Android 8 a 11 exige ubicación para buscar
 * por Bluetooth: solo ahí se pide.
 */
async function ensureBlePermissions() {
  if (Platform.OS !== 'android') return;
  const modern = Number(Platform.Version) >= 31;
  const perms = modern ? [PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];
  const res = await PermissionsAndroid.requestMultiple(perms.filter(Boolean) as any);
  const denied = Object.values(res).some((v) => v !== PermissionsAndroid.RESULTS.GRANTED);
  if (denied)
    throw new Error(
      modern ? t('Se necesitan permisos de Bluetooth para conectar el Ledger') : t('Android pide el permiso de ubicación para buscar el Ledger por Bluetooth. Quorum no usa tu ubicación.'),
    );
}

/** Busca Ledgers cercanos durante `ms` milisegundos. */
export async function scanLedgers(ms = 8000): Promise<LedgerFound[]> {
  await ensureBlePermissions();
  return new Promise((resolve, reject) => {
    const found = new Map<string, LedgerFound>();
    const sub = TransportBLE.listen({
      next: (e: any) => {
        if (e.type === 'add' && e.descriptor) {
          found.set(e.descriptor.id, { id: e.descriptor.id, name: e.descriptor.localName ?? e.descriptor.name ?? 'Ledger' });
        }
      },
      error: (err: any) => {
        sub.unsubscribe();
        reject(new Error(`Bluetooth: ${err?.message ?? err}`));
      },
      complete: () => {},
    });
    setTimeout(() => {
      sub.unsubscribe();
      resolve([...found.values()]);
    }, ms);
  });
}

/**
 * Abre el Ledger correcto para firmar.
 * - Primero intenta el Ledger registrado (iOS recuerda su emparejamiento: por eso conecta solo).
 * - Si no está, busca los Ledger cercanos.
 * - Con `expectedPubKey`, antes de pedir la firma pregunta a cada Ledger su clave (sin mostrar
 *   nada en pantalla) y usa solo uno que coincida: un Ledger con otra frase semilla se descarta,
 *   y si hay dos encendidos se firma en el que corresponde. Dos Ledger con la misma frase son
 *   el mismo firmante: cualquiera sirve.
 */
async function openLedger(deviceId: string, expectedPubKey?: string, path = LEDGER_XRP_PATH): Promise<any> {
  const matches = async (transport: any) => {
    if (!expectedPubKey) return true;
    try {
      const r = await new Xrp(transport as any).getAddress(path, false);
      return compressPublicKey(r.publicKey).toUpperCase() === compressPublicKey(expectedPubKey).toUpperCase();
    } catch {
      return false;
    }
  };
  const tryOpen = async (id: string) => {
    let t: any;
    try {
      t = await TransportBLE.open(id);
    } catch {
      return null;
    }
    if (await matches(t)) return t;
    try {
      await t.close();
    } catch {}
    return null;
  };

  if (deviceId) {
    const t = await tryOpen(deviceId);
    if (t) return t;
  }
  const found = await scanLedgers(6000);
  if (!found.length) throw new Error('No se encontró el Ledger. Revisa que tenga Bluetooth activo, esté desbloqueado y con la app XRP abierta.');
  for (const f of found) {
    if (f.id === deviceId) continue;
    const t = await tryOpen(f.id);
    if (t) return t;
  }
  throw new Error(
    expectedPubKey
      ? 'Ningún Ledger cercano tiene la clave de este firmante. Usa el Ledger registrado (o uno con su misma frase semilla), desbloqueado y con la app XRP abierta.'
      : 'No se pudo conectar con el Ledger.',
  );
}

async function withLedger<T>(deviceId: string, fn: (xrp: Xrp) => Promise<T>, expectedPubKey?: string, path?: string): Promise<T> {
  const transport = await openLedger(deviceId, expectedPubKey, path);
  try {
    return await fn(new Xrp(transport as any));
  } finally {
    try {
      await transport.close();
    } catch {}
  }
}

function friendlyLedgerError(e: any): Error {
  if (e instanceof Error && !('statusCode' in e) && /Ledger/.test(e.message)) return e;
  const code = e?.statusCode;
  if (code === 0x6985) return new Error('Rechazado en el Ledger');
  if (code === 0x6e00 || code === 0x6d00 || code === 0x6511) return new Error('Abre la app XRP en el Ledger');
  if (code === 0x5515) return new Error('Desbloquea el Ledger');
  return new Error(`Ledger: ${e?.message ?? e}`);
}

export async function ledgerGetAddress(
  deviceId: string,
  path = LEDGER_XRP_PATH,
  showOnDevice = false,
): Promise<{ address: string; publicKey: string }> {
  try {
    return await withLedger(deviceId, async (xrp) => {
      const r = await xrp.getAddress(path, showOnDevice);
      return { address: r.address, publicKey: compressPublicKey(r.publicKey) };
    });
  } catch (e) {
    throw friendlyLedgerError(e);
  }
}

/** Firma como uno de los firmantes de la multifirma. Devuelve DER canónico. */
export async function ledgerSignMulti(deviceId: string, tx: TxJson, path = LEDGER_XRP_PATH, expectedPubKey?: string): Promise<string> {
  const { Signers, TxnSignature, ...rest } = tx;
  const blob = encode({ ...rest, SigningPubKey: '' } as any);
  try {
    const sig = await withLedger(deviceId, (xrp) => xrp.signTransaction(path, blob), expectedPubKey, path);
    return toCanonicalDer(sig);
  } catch (e) {
    throw friendlyLedgerError(e);
  }
}

/** Firma simple (cuando el Ledger es la clave maestra de la bóveda). */
export async function ledgerSignSingle(deviceId: string, tx: TxJson, publicKey: string, path = LEDGER_XRP_PATH): Promise<string> {
  const { Signers, TxnSignature, ...rest } = tx;
  const blob = encode({ ...rest, SigningPubKey: publicKey } as any);
  try {
    const sig = await withLedger(deviceId, (xrp) => xrp.signTransaction(path, blob), publicKey, path);
    return toCanonicalDer(sig);
  } catch (e) {
    throw friendlyLedgerError(e);
  }
}
