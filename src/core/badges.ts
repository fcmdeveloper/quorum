/**
 * Insignias "Quorum Validator": NFTs no transferibles que la cuenta de la galería entrega a
 * cada validador con una validación correcta (ver VALIDATORS.md).
 *
 * Todo el estado sale del ledger, sin listas guardadas:
 * - el NFTokenMint lleva el memo `quorum.badge {"release":…,"to":…}` (para quién es), con
 *   `"platform":"android"` si es por una validación de Android (sin plataforma: iOS);
 * - si la galería todavía tiene el NFT y hay una oferta para esa dirección: ofrecida;
 * - si la galería ya no lo tiene: entregada (el validador la aceptó).
 */
import { getClient, NetworkId } from './network';
import { TxJson } from './tx';
import { AppPlatform, ReleaseLog, attestationMatches, normPlatform } from './releases';

/** Número de colección (taxon) de las insignias: todas las versiones en una sola colección. */
export const BADGE_TAXON = 2026;

const toHex = (s: string) => Buffer.from(s, 'utf8').toString('hex').toUpperCase();
const hexToText = (h: string) => {
  try {
    return Buffer.from(h, 'hex').toString('utf8');
  } catch {
    return '';
  }
};

/** Metadata pública de cada edición: quorumxrpl.com/nft/validator-<versión>.json */
export const badgeUri = (website: string, release: string) => `${website}/nft/validator-${release}.json`;

/** Acuña la insignia (sin flag transferible: solo puede volver a la galería). */
export function buildBadgeMint(gallery: string, release: string, to: string, uri: string, platform: AppPlatform = 'ios'): TxJson {
  // iOS sin campo: así se leen igual las insignias acuñadas antes de separar por plataforma
  const body = platform === 'ios' ? { release, to } : { release, platform, to };
  return {
    TransactionType: 'NFTokenMint',
    Account: gallery,
    NFTokenTaxon: BADGE_TAXON,
    Flags: 0,
    URI: toHex(uri),
    Memos: [{ Memo: { MemoData: toHex(`quorum.badge ${JSON.stringify(body)}`) } }],
  };
}

/** La ofrece gratis, solo a esa dirección. */
export function buildBadgeOffer(gallery: string, nftId: string, to: string): TxJson {
  return { TransactionType: 'NFTokenCreateOffer', Account: gallery, NFTokenID: nftId, Amount: '0', Flags: 1, Destination: to };
}

export interface BadgeMint {
  nftId: string;
  release: string;
  platform: AppPlatform;
  to: string;
  hash: string;
}

/** Insignias acuñadas por la galería (de su historial de transacciones). */
export function readBadgeMints(gallery: string, txs: any[]): BadgeMint[] {
  const out: BadgeMint[] = [];
  for (const x of txs) {
    const tx = x.tx_json ?? x.tx ?? {};
    const meta = x.meta ?? {};
    if (tx.TransactionType !== 'NFTokenMint' || tx.Account !== gallery || meta.TransactionResult !== 'tesSUCCESS') continue;
    if (tx.NFTokenTaxon !== BADGE_TAXON || !meta.nftoken_id) continue;
    for (const m of tx.Memos ?? []) {
      const r = /^quorum\.badge\s+(\{[\s\S]*\})$/.exec(hexToText(m?.Memo?.MemoData ?? '').trim());
      if (!r) continue;
      try {
        const d = JSON.parse(r[1]);
        const platform = normPlatform(d.platform);
        if (typeof d.release === 'string' && typeof d.to === 'string' && platform)
          out.push({ nftId: meta.nftoken_id, release: d.release, platform, to: d.to, hash: x.hash ?? tx.hash ?? '' });
      } catch {}
    }
  }
  return out;
}

export type BadgeState = 'todo' | 'minted' | 'offered' | 'delivered';

export interface BadgeRow {
  release: string;
  platform: AppPlatform;
  to: string;
  state: BadgeState;
  nftId?: string;
}

/**
 * Una fila por cada validación correcta de una versión registrada, con su estado. iOS y Android
 * son registros distintos: quien valida las dos plataformas recibe una insignia por cada una.
 * `exclude`: cuentas que no reciben insignia (las de Minify).
 */
export function badgeRows(
  log: ReleaseLog,
  mints: BadgeMint[],
  owned: Set<string>,
  offers: { nftId: string; to: string }[],
  exclude: Set<string>,
): BadgeRow[] {
  const rows: BadgeRow[] = [];
  for (const r of log.releases) {
    const seen = new Set<string>();
    for (const a of log.attestations) {
      if (a.release !== r.v || a.platform !== r.platform || seen.has(a.account)) continue;
      seen.add(a.account);
      if (a.result !== 'pass' || !attestationMatches(r, a) || exclude.has(a.account)) continue;
      const base = { release: r.v, platform: r.platform, to: a.account };
      const m = mints.find((x) => x.release === r.v && x.platform === r.platform && x.to === a.account);
      if (!m) rows.push({ ...base, state: 'todo' });
      else if (!owned.has(m.nftId)) rows.push({ ...base, state: 'delivered', nftId: m.nftId });
      else if (offers.some((o) => o.nftId === m.nftId && o.to === a.account)) rows.push({ ...base, state: 'offered', nftId: m.nftId });
      else rows.push({ ...base, state: 'minted', nftId: m.nftId });
    }
  }
  return rows;
}

/** Lo que la galería necesita del ledger: sus acuñaciones, sus NFTs y sus ofertas abiertas. */
export async function fetchGalleryBadgeState(net: NetworkId, gallery: string) {
  const client = await getClient(net);
  const txs: any[] = [];
  let marker: unknown;
  do {
    const r: any = await client.request({ command: 'account_tx', account: gallery, limit: 200, marker, api_version: 2 } as any);
    txs.push(...(r.result.transactions ?? []));
    marker = r.result.marker;
  } while (marker && txs.length < 2000);
  const owned = new Set<string>();
  marker = undefined;
  do {
    const r: any = await client.request({ command: 'account_nfts', account: gallery, limit: 400, marker } as any);
    for (const n of r.result.account_nfts ?? []) if (n.NFTokenTaxon === BADGE_TAXON) owned.add(n.NFTokenID);
    marker = r.result.marker;
  } while (marker);
  const offers: { nftId: string; to: string }[] = [];
  marker = undefined;
  do {
    const r: any = await client.request({ command: 'account_objects', account: gallery, type: 'nft_offer', limit: 400, marker } as any);
    for (const o of r.result.account_objects ?? []) if (o.Destination) offers.push({ nftId: o.NFTokenID, to: o.Destination });
    marker = r.result.marker;
  } while (marker);
  return { mints: readBadgeMints(gallery, txs), owned, offers };
}
