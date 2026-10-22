import { requireOptionalNativeModule } from 'expo';

interface TangemNfcNative {
  isAvailable(): boolean;
  runJsonRpc(request: string, cardId: string | null, initialMessage: string | null): Promise<string>;
  clearSavedAccessCodes?(): boolean;
}

const native = requireOptionalNativeModule<TangemNfcNative>('TangemNfc');

export const tangemNativeLoaded = native != null;

export function isNfcAvailable(): boolean {
  try {
    return native?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

/** Olvida los códigos de tarjeta guardados con Face ID (iOS) o la huella (Android). */
export function clearSavedTangemCodes(): boolean {
  try {
    return native?.clearSavedAccessCodes?.() ?? false;
  } catch {
    return false;
  }
}

let nextId = 1;

/** Ejecuta un método JSON-RPC de Tangem SDK y devuelve `result` o lanza el error de la tarjeta. */
export async function tangemRpc<T = any>(
  method: 'SCAN' | 'SIGN_HASH' | 'DERIVE_WALLET_PUBLIC_KEY',
  params: Record<string, unknown>,
  opts: { cardId?: string; message?: { header?: string; body?: string } } = {},
): Promise<T> {
  if (!native) {
    throw new Error('El módulo nativo de Tangem no está en este build. Compila un development build (no Expo Go).');
  }
  const request = JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params });
  const raw = await native.runJsonRpc(request, opts.cardId ?? null, opts.message ? JSON.stringify(opts.message) : null);
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (parsed?.error) {
    const e = parsed.error;
    const msg = e?.data?.message ?? e?.message ?? JSON.stringify(e);
    const err = new Error(`Tangem: ${msg}`);
    (err as any).code = e?.data?.code ?? e?.code;
    throw err;
  }
  return parsed.result as T;
}
