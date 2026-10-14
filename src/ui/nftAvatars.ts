import { useEffect } from 'react';
import { useApp } from '../state';
import { fetchNfts } from '../core/network';
import { QUORUM } from '../config';

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
