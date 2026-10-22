/**
 * Huella (SHA-256) del código de esta app: el archivo main.jsbundle que va dentro de la app,
 * el mismo que reconstruye scripts/verify-release.sh. En un build de desarrollo no existe
 * (el código llega desde el computador) y se devuelve null.
 * En Android el mismo bytecode va dentro del APK como `assets/index.android.bundle` (se lee con
 * la ruta `asset:///`); `scripts/verify-release.sh <tag> android` lo reconstruye.
 */
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import type { AppPlatform } from '../core/releases';

/** Plataforma de esta app, para registrar y validar cada build por separado. */
export const thisPlatform = (): AppPlatform => (Platform.OS === 'android' ? 'android' : 'ios');

let cached: string | null | undefined;

export async function appCodeHash(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const f = Platform.OS === 'android' ? new File('asset:///index.android.bundle') : new File(Paths.bundle, 'main.jsbundle');
    if (!f.exists) return (cached = null);
    const buf = await f.arrayBuffer();
    const d = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buf));
    cached = Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
    return cached;
  } catch {
    return (cached = null);
  }
}
