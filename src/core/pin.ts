/**
 * NFT fijado como imagen de la cuenta, guardado en el XRP Ledger.
 *
 * Se usa el campo WalletLocator de la cuenta (256 bits, sin significado propio en el ledger):
 * un AccountSet lo fija con el ID del NFT y con ceros lo borra. No mueve fondos ni ocupa reserva.
 * Así cualquier teléfono con Quorum (y el visor web) ve la misma imagen, sin servidores.
 *
 * El ledger acepta cualquier valor en ese campo y otras apps podrían usarlo para otra cosa, así que
 * al mostrarlo SIEMPRE se verifica: tiene que ser un NFT que la cuenta todavía tiene, o uno de la
 * galería pública de Quorum. Si no, no se muestra nada.
 */
import { encodeAccountID } from 'ripple-address-codec';
import { NetworkId, NftItem, findNftIn, loadNftMetadata } from './network';
import { TxJson } from './tx';

export const ZERO_256 = '0'.repeat(64);

export const isNftId = (v: unknown): v is string => typeof v === 'string' && /^[0-9A-F]{64}$/i.test(v) && /[1-9A-F]/i.test(v);

/** AccountSet que fija (o con null, borra) el NFT de la cuenta. */
export function buildPinNft(account: string, nftId: string | null): TxJson {
  if (nftId !== null && !isNftId(nftId)) throw new Error('ID de NFT inválido');
  return { TransactionType: 'AccountSet', Account: account, WalletLocator: nftId ? nftId.toUpperCase() : ZERO_256 };
}

/** Emisor codificado dentro del ID del NFT (bytes 4 a 24). */
export function nftIssuer(nftId: string): string {
  return encodeAccountID(Buffer.from(nftId.slice(8, 48), 'hex'));
}

export interface PinnedNft {
  item: NftItem;
  /** true: es de la galería pública de Quorum (la tiene la galería, no la cuenta). */
  gallery: boolean;
  network: NetworkId;
}

/**
 * Verifica y resuelve el NFT fijado de una cuenta. null: no hay o no es válido (no mostrar).
 * Lanza si no se pudo consultar la red (en ese caso no hay que quitar nada).
 */
export async function resolvePinnedNft(net: NetworkId, account: string, walletLocator: string | null | undefined, gallery?: string): Promise<PinnedNft | null> {
  if (!isNftId(walletLocator)) return null;
  const id = walletLocator.toUpperCase();
  const own = await findNftIn(net, account, id);
  if (own) return { item: await loadNftMetadata(own), gallery: false, network: net };
  if (gallery && nftIssuer(id) === gallery) {
    const g = await findNftIn('mainnet', gallery, id);
    if (g) return { item: await loadNftMetadata(g), gallery: true, network: 'mainnet' };
  }
  return null;
}

/** ¿Se puede fijar este NFT en esta cuenta? Solo si la cuenta lo tiene o si es de la galería. */
export async function canPin(net: NetworkId, account: string, nftId: string, gallery?: string): Promise<boolean> {
  if (!isNftId(nftId)) return false;
  if (await findNftIn(net, account, nftId)) return true;
  return !!gallery && nftIssuer(nftId) === gallery && !!(await findNftIn('mainnet', gallery, nftId));
}
