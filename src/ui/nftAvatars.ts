import { useEffect } from 'react';
import { useApp } from '../state';
import { Image } from 'expo-image';
import { NftItem, fetchNfts, ipfsToHttp } from '../core/network';
import { loadMetaParallel, withCachedMeta } from '../core/nftCache';
import { QUORUM } from '../config';
import { BADGE_TAXON } from '../core/badges';
import { resolvePinnedNft } from '../core/pin';

/**
 * Revisa que los NFTs elegidos como imagen sigan en alguna de tus cuentas de Quorum.
 * Si uno ya no está (lo vendiste o lo transferiste), esa cuenta vuelve a su ícono.
 * Si no se pudo consultar la red, no se quita nada.
 */
export function useNftAvatarCheck() {
  const app = useApp();
  const key = app.accounts
    .filter((a) => a.nft)
    .map((a) => `${a.id}:${a.nft!.id}`)
    .join(',');

  useEffect(() => {
    if (!app.ready || !key) return;
    let alive = true;
    (async () => {
      const withNft = app.accounts.filter((a) => a.nft);
      const nets = new Set(withNft.filter((a) => !a.nft!.gallery).map((a) => a.nft!.network));
      const owned = new Set<string>();
      const failed = new Set<string>();
      const seen = new Set<string>();
      for (const acc of app.accounts) {
        const k = `${acc.network}:${acc.address}`;
        if (!nets.has(acc.network) || seen.has(k)) continue;
        seen.add(k);
        try {
          for (const n of await fetchNfts(acc.network, acc.address)) owned.add(`${acc.network}:${n.id}`);
        } catch {
          failed.add(acc.network);
        }
      }
      // NFTs de la galería pública: siguen valiendo mientras estén en la galería
      let galleryFailed = false;
      if (withNft.some((a) => a.nft!.gallery) && QUORUM.nftGalleryAddress) {
        try {
          for (const n of await fetchNfts('mainnet', QUORUM.nftGalleryAddress)) owned.add(`gallery:${n.id}`);
        } catch {
          galleryFailed = true;
        }
      }
      if (!alive) return;
      // una a la vez: al cambiar la cuenta, este efecto vuelve a correr con la lista nueva
      const gone = withNft.find((a) =>
        a.nft!.gallery
          ? !galleryFailed && !owned.has(`gallery:${a.nft!.id}`)
          : !failed.has(a.nft!.network) && !owned.has(`${a.nft!.network}:${a.nft!.id}`),
      );
      if (gone) await app.updateAccount(gone.id, { nft: undefined });
    })();
    return () => {
      alive = false;
    };
  }, [key, app.ready]);
}

/**
 * Precarga la galería pública de NFTs unos segundos después de abrir la app (metadata a la
 * caché e imágenes al disco), para que al elegir una imagen ya esté lista. Una vez por sesión.
 */
let galleryWarmed = false;
export function useGalleryPrefetch() {
  const app = useApp();
  useEffect(() => {
    if (!app.ready || galleryWarmed || !QUORUM.nftGalleryAddress) return;
    galleryWarmed = true;
    const timer = setTimeout(async () => {
      try {
        // solo lo primero que se ve (una fila); el resto se carga al pedir "Ver más"
        const list = (await fetchNfts('mainnet', QUORUM.nftGalleryAddress)).filter((n) => n.taxon !== BADGE_TAXON).slice(0, 3);
        const { items, pending } = await withCachedMeta(list);
        const done: NftItem[] = items.filter((n) => n.image);
        await loadMetaParallel(pending, (r) => r.image && done.push(r), () => true, 3);
        const urls = done.map((n) => ipfsToHttp(n.image)).filter((u): u is string => !!u && /^https?:/.test(u));
        if (urls.length) await Image.prefetch(urls, 'disk');
      } catch {
        // sin red: se cargará al abrir la galería
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [app.ready]);
}

/**
 * NFT fijado en el XRP Ledger (campo WalletLocator): se muestra en cualquier teléfono con Quorum,
 * también en cuentas de solo lectura. Una elección propia hecha en este teléfono (sin `pinned`)
 * no se reemplaza. Si el ledger ya no lo tiene fijado o dejó de ser válido, se quita.
 */
export function usePinnedNftSync() {
  const app = useApp();
  const key = app.accounts
    .map((a) => `${a.id}:${app.stateOf(a)?.walletLocator ?? '-'}:${a.nft?.pinned ? a.nft.id : a.nft ? 'own' : '-'}`)
    .join(',');
  useEffect(() => {
    if (!app.ready) return;
    let alive = true;
    (async () => {
      for (const a of app.accounts) {
        const st = app.stateOf(a);
        if (!st || !st.exists) continue;
        const wl = st.walletLocator ?? null;
        if (a.nft && !a.nft.pinned) continue; // elección propia de este teléfono
        if (!wl) {
          if (a.nft?.pinned) await app.updateAccount(a.id, { nft: undefined });
          continue;
        }
        if (a.nft?.pinned && a.nft.id === wl) continue;
        try {
          const r = await resolvePinnedNft(a.network, a.address, wl, QUORUM.nftGalleryAddress || undefined);
          if (!alive) return;
          if (r?.item.image) {
            await app.updateAccount(a.id, { nft: { id: r.item.id, image: r.item.image, name: r.item.name, network: r.network, gallery: r.gallery || undefined, pinned: true } });
          } else if (!r && a.nft?.pinned) {
            await app.updateAccount(a.id, { nft: undefined });
          }
        } catch {
          // sin red: se reintenta en la próxima actualización
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [key, app.ready]);
}
