import React, { useEffect, useState } from 'react';
import { Dimensions, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Address, Badge, Button, Empty, Row, Screen, Txt } from '../ui/components';
import { C, R, SP } from '../ui/theme';
import { NETWORKS, NftItem, fetchNfts } from '../core/network';
import { loadMetaParallel, withCachedMeta } from '../core/nftCache';
import { NftImage } from '../ui/NftImage';

const W = Dimensions.get('window').width;

const TILE = (W - SP.lg * 2 - SP.md) / 2;

export default function NftsScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id)!;
  const [items, setItems] = useState<NftItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<NftItem | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchNfts(a.network, a.address);
        // las imágenes ya conocidas aparecen al instante (caché); luego se completa el detalle
        const { items: cached, pending } = await withCachedMeta(list);
        if (!alive) return;
        setItems(cached);
        const rest = list.filter((n) => !pending.some((p) => p.id === n.id));
        await loadMetaParallel(
          [...pending, ...rest],
          (r) => setItems((prev) => (prev ? prev.map((n) => (n.id === r.id ? r : n)) : prev)),
          () => alive,
          4,
        );
      } catch (e: any) {
        setErr(e.message);
        setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <Screen title={`NFTs · ${a.label}`} onBack={nav.pop}>
      {items === null ? (
        <Txt v="small">Buscando NFTs…</Txt>
      ) : items.length === 0 ? (
        <Empty icon="image" title="Sin NFTs" text={err ?? 'Esta cuenta no tiene NFTs del XRP Ledger.'} />
      ) : (
        <>
          <Txt v="small" style={{ marginBottom: SP.md }}>
            {items.length} NFT{items.length === 1 ? '' : 's'}
          </Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SP.md }}>
            {items.map((n) => (
              <Pressable key={n.id} onPress={() => setOpen(n)} style={{ width: TILE }}>
                <View style={{ width: TILE, height: TILE, borderRadius: R.md, backgroundColor: C.surface2, overflow: 'hidden', borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
                  <NftImage src={n.image} />
                </View>
                <Txt v="body" numberOfLines={1} style={{ marginTop: 6 }}>
                  {n.name ?? `#${n.serial}`}
                </Txt>
                <Txt v="small" numberOfLines={1}>
                  {n.collection ?? `${n.issuer.slice(0, 6)}…`}
                </Txt>
              </Pressable>
            ))}
          </View>
        </>
      )}

      <Modal visible={!!open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(null)}>
        {open && (
          <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: SP.lg, paddingBottom: 60 }}>
            <View style={{ alignItems: 'flex-end' }}>
              <Pressable onPress={() => setOpen(null)} hitSlop={12}>
                <Feather name="x" size={26} color={C.text} />
              </Pressable>
            </View>
            <View style={{ width: '100%', aspectRatio: 1, borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.surface2, marginTop: SP.md, alignItems: 'center', justifyContent: 'center' }}>
              <NftImage src={open.image} fit="contain" size={48} />
            </View>
            <Txt v="h1" style={{ marginTop: SP.lg }}>
              {open.name ?? `NFT #${open.serial}`}
            </Txt>
            {open.collection ? <Badge text={String(open.collection)} /> : null}
            {open.description ? (
              <Txt v="body" color={C.dim} style={{ marginTop: SP.md }}>
                {open.description}
              </Txt>
            ) : null}
            {open.attributes?.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: SP.lg }}>
                {open.attributes.slice(0, 20).map((t, i) => (
                  <View key={i} style={{ backgroundColor: C.surface2, borderRadius: R.sm, padding: 10, borderWidth: 1, borderColor: C.line }}>
                    <Txt v="small">{String(t.trait_type ?? 'Atributo')}</Txt>
                    <Txt v="body">{String(t.value)}</Txt>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={{ marginTop: SP.xl }}>
              <Row k="Emisor" v={<Address value={open.issuer} short />} />
              <Row k="Serie" v={String(open.serial)} />
              <Row k="Taxón" v={String(open.taxon)} />
              <Row k="ID" v={<Address value={open.id} short label="ID" />} />
            </View>
            <Button title="Ver en el explorador" kind="secondary" icon="external-link" onPress={() => Linking.openURL(`${NETWORKS[a.network].explorer}/nft/${open.id}`)} />
          </ScrollView>
        )}
      </Modal>
    </Screen>
  );
}
