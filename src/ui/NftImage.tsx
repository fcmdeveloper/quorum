import React, { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { C } from './theme';
import { IPFS_GATEWAYS, gatewayOfUrl, gatewayOrder, ipfsPath, ipfsToHttp, markGateway } from '../core/network';

/**
 * Imagen de NFT. Parte por el gateway IPFS que mejor viene respondiendo; si falla, prueba el
 * siguiente, y si todos fallan muestra un ícono. Cada resultado ajusta la preferencia.
 */
export function NftImage({ src, fit = 'cover', size = 28 }: { src?: string; fit?: 'cover' | 'contain'; size?: number }) {
  const [g, setG] = useState(0);
  const [order, setOrder] = useState(gatewayOrder);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setG(0);
    setOrder(gatewayOrder());
    setFailed(false);
  }, [src]);
  if (!src || failed) return <Feather name="image" size={size} color={C.faint} />;
  const uri = ipfsToHttp(src, g, order)!;
  return (
    <Image
      source={{ uri }}
      style={{ width: '100%', height: '100%' }}
      contentFit={fit}
      transition={200}
      cachePolicy="memory-disk"
      onLoad={() => markGateway(gatewayOfUrl(uri), true)}
      onError={() => {
        markGateway(gatewayOfUrl(uri), false);
        if (ipfsPath(src) && g < IPFS_GATEWAYS.length - 1) setG(g + 1);
        else setFailed(true);
      }}
    />
  );
}
