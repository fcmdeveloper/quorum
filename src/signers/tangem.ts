/**
 * Tarjetas Tangem (normales o Xaman) vía Tangem SDK por NFC.
 * La tarjeta firma el hash de 32 bytes; nosotros armamos la firma DER canónica.
 */
import { t } from '../i18n';
import { tangemRpc } from '../../modules/tangem-nfc';
import { addressFromPublicKey, bytesToHex, compressPublicKey, toCanonicalDer } from '../core/crypto';
import { XRP_PATH } from './types';

export interface TangemCandidate {
  cardId: string;
  walletPublicKey: string;
  derivationPath?: string;
  publicKey: string;
  address: string;
  note: string;
}

interface CardWallet {
  publicKey: string;
  chainCode?: string | null;
  curve: string;
  index: number;
}

/**
 * Escanea la tarjeta y devuelve las direcciones XRPL posibles:
 * - la clave directa de cada wallet secp256k1 (tarjetas Xaman y Tangem antiguas)
 * - la clave derivada en m/44'/144'/0'/0/0 si la wallet es HD (Tangem Wallet 2.0)
 * Debes elegir la que coincide con la dirección que ves en la app Tangem/Xaman.
 */
export interface TangemScan {
  candidates: TangemCandidate[];
  /** Avisos legibles: derivaciones que fallaron, wallets en otra curva, etc. */
  notes: string[];
}

/** Busca en derivedKeys (que el SDK llena al escanear) la clave de la ruta XRP. */
function derivedFromScan(w: any): string | null {
  const dk = w?.derivedKeys;
  if (!dk || typeof dk !== 'object') return null;
  const norm = (p: string) => p.replace(/h/g, "'").replace(/\s/g, '');
  for (const [path, v] of Object.entries<any>(dk)) {
    if (norm(path) === norm(XRP_PATH) && v?.publicKey) return v.publicKey;
  }
  return null;
}

export async function scanTangem(): Promise<TangemScan> {
  const card: any = await tangemRpc('SCAN', {}, { message: { header: 'Acerca la tarjeta Tangem', body: 'Leyendo la tarjeta' } });
  const cardId: string = card.cardId;
  const all: any[] = card.wallets ?? [];
  const wallets: CardWallet[] = all.filter((w) => w.curve === 'secp256k1' && w.publicKey);
  const notes: string[] = [];
  const others = all.filter((w) => w.curve !== 'secp256k1').map((w) => w.curve);
  if (others.length) notes.push(t('La tarjeta también tiene wallets {x} (Quorum usa secp256k1).', { x: [...new Set(others)].join(', ') }));
  if (wallets.length === 0) throw new Error('La tarjeta no tiene una wallet secp256k1 (la que usa XRP)');

  const out: TangemCandidate[] = [];
  for (const w of wallets) {
    const isHd = !!w.chainCode || !!(w as any).derivedKeys;
    // 1) clave derivada como la app Tangem (Wallet 2.0 / frase semilla)
    let derivedPk = derivedFromScan(w);
    if (!derivedPk && isHd) {
      try {
        const d: any = await tangemRpc(
          'DERIVE_WALLET_PUBLIC_KEY',
          { walletPublicKey: w.publicKey, derivationPath: XRP_PATH },
          { cardId, message: { header: 'Acerca de nuevo la tarjeta', body: 'Derivando la dirección XRP' } },
        );
        derivedPk = d?.publicKey ?? null;
      } catch (e: any) {
        notes.push(t('No se pudo derivar la dirección de la app Tangem (wallet {n}): {e}. Vuelve a escanear y mantén la tarjeta quieta hasta el final.', { n: w.index, e: e?.message ?? e }));
      }
    }
    if (derivedPk) {
      const pk = compressPublicKey(derivedPk);
      out.push({
        cardId,
        walletPublicKey: w.publicKey,
        derivationPath: XRP_PATH,
        publicKey: pk,
        address: addressFromPublicKey(pk),
        note: t('Dirección de la app Tangem ({x})', { x: XRP_PATH }),
      });
    } else if (!isHd) {
      notes.push(t('La wallet {n} no es HD: solo tiene la clave directa (normal en tarjetas Xaman o Tangem antiguas).', { n: w.index }));
    }
    // 2) clave directa (tarjetas Xaman y Tangem antiguas)
    const direct = compressPublicKey(w.publicKey);
    out.push({
      cardId,
      walletPublicKey: w.publicKey,
      publicKey: direct,
      address: addressFromPublicKey(direct),
      note: t('Clave directa (wallet {n}) · la usan tarjetas Xaman', { n: w.index }),
    });
  }
  return { candidates: out.filter((c) => c.address), notes };
}

/** Firma un hash de 32 bytes con la tarjeta y devuelve DER canónico. */
export async function tangemSignHash(
  hash: Uint8Array,
  t: { cardId: string; walletPublicKey: string; derivationPath?: string },
  context: string,
): Promise<string> {
  const params: Record<string, unknown> = {
    walletPublicKey: t.walletPublicKey,
    hash: bytesToHex(hash),
  };
  if (t.derivationPath) params.derivationPath = t.derivationPath;
  // Sin fijar cardId: cualquier tarjeta del mismo set de respaldo (misma clave) puede firmar.
  // La tarjeta busca la wallet por su clave pública; otra tarjeta cualquiera no la tiene y falla.
  let res: any;
  try {
    res = await tangemRpc('SIGN_HASH', params, {
      message: { header: 'Firmar con Tangem', body: context },
    });
  } catch (e: any) {
    if (/wallet.*not.*found|walletNotFound|no.*wallet/i.test(String(e?.message))) {
      throw new Error('Esta tarjeta no es de este firmante. Usa la tarjeta registrada o una de su mismo set de respaldo.');
    }
    throw e;
  }
  if (!res?.signature) throw new Error('La tarjeta no devolvió firma');
  return toCanonicalDer(res.signature);
}
