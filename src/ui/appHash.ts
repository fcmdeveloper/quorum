/**
 * Huella (SHA-256) del código de esta app: el archivo main.jsbundle que va dentro de la app,
 * el mismo que reconstruye scripts/verify-release.sh. En un build de desarrollo no existe
 * (el código llega desde el computador) y se devuelve null.
 */
import { File, Paths } from 'expo-file-system';
import * as Crypto from 'expo-crypto';

let cached: string | null | undefined;

export async function appCodeHash(): Promise<string | null> {
  if (cached !== undefined) return cached;
  try {
    const f = new File(Paths.bundle, 'main.jsbundle');
    if (!f.exists) return (cached = null);
    const buf = await f.arrayBuffer();
    const d = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(buf));
    cached = Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('');
    return cached;
  } catch {
    return (cached = null);
  }
}
