import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { C } from './theme';
import { IPFS_GATEWAYS, ipfsPath, ipfsToHttp } from '../core/network';

/** Imagen de NFT: si un gateway IPFS falla, prueba el siguiente; si todos fallan, muestra un ícono. */
export function NftImage({ src, fit = 'cover', size = 28 }: { src?: string; fit?: 'cover' | 'contain'; size?: number }) {
  const [g, setG] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setG(0);
    setFailed(false);
  }, [src]);
  if (!src || failed) return <Feather name="image" size={size} color={C.faint} />;
  const uri = ipfsToHttp(src, g)!;
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      contentFit={fit}
      transition={200}
      cachePolicy="memory-disk"
      onError={() => {
        if (ipfsPath(src) && g < IPFS_GATEWAYS.length - 1) setG(g + 1);
        else setFailed(true);
      }}
    />
  );
}
