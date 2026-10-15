import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dimensions, FlatList, Linking, Modal, Pressable, ScrollView, View, ViewToken } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Address, Badge, Button, Empty, Notice, Row, Screen, Txt } from '../ui/components';
import { locale, t } from '../i18n';
import { C, R, SP } from '../ui/theme';
import { NETWORKS, NftItem, fetchNftsPage } from '../core/network';
import { loadMetaParallel, withCachedMeta } from '../core/nftCache';
import { NftImage } from '../ui/NftImage';

const W = Dimensions.get('window').width;

const TILE = (W - SP.lg * 2 - SP.md) / 2;

export default function NftsScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id)!;
  const [items, setItems] = useState<NftItem[] | null>(null);
  const [complete, setComplete] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<NftItem | null>(null);
  const alive = useRef(true);
  const requested = useRef<Set<string>>(new Set());
  const itemsRef = useRef<NftItem[]>([]);

  // Cuentas con miles de NFTs: se leen página por página (400 cada una) y se van mostrando;
  // la metadata e imagen solo se piden para lo que aparece en pantalla.
  useEffect(() => {
    alive.current = true;
    (async () => {
      let marker: unknown;
      try {
        do {
          const page = await fetchNftsPage(a.network, a.address, marker);
          const { items: withCache } = await withCachedMeta(page.items);
          if (!alive.current) return;
          itemsRef.current = [...itemsRef.current, ...withCache];
          setItems(itemsRef.current);
          marker = page.marker;
        } while (marker && alive.current);
        if (alive.current) setComplete(true);
      } catch (e: any) {
        if (!alive.current) return;
        setErr(e.message);
        setItems(itemsRef.current);
        setComplete(true);
      }
    })();
    return () => {
      alive.current = false;
    };
  }, [id]);

  const update = (r: NftItem) => {
    itemsRef.current = itemsRef.current.map((n) => (n.id === r.id ? r : n));
    setItems(itemsRef.current);
  };

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const need = viewableItems
      .map((v) => v.item as NftItem)
      .filter((n) => n && !n.image && !requested.current.has(n.id));
    if (!need.length) return;
    need.forEach((n) => requested.current.add(n.id));
    loadMetaParallel(need, update, () => alive.current, 4);
  }).current;

  const tile = useCallback(
    ({ item: n }: { item: NftItem }) => (
      <Pressable onPress={() => setOpen(n)} style={{ width: TILE }}>
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
    ),
    [],
  );

  const count = items?.length ?? 0;
  return (
    <Screen title={`NFTs · ${a.label}`} onBack={nav.pop} scroll={false} padded={false}>
      {items === null ? (
        <View style={{ padding: SP.lg }}>
          <Txt v="small">Buscando NFTs…</Txt>
        </View>
      ) : count === 0 ? (
        <View style={{ padding: SP.lg }}>
          <Empty icon="image" title="Sin NFTs" text={err ?? 'Esta cuenta no tiene NFTs del XRP Ledger.'} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(n) => n.id}
          renderItem={tile}
          numColumns={2}
          columnWrapperStyle={{ gap: SP.md }}
          contentContainerStyle={{ padding: SP.lg, gap: SP.md, paddingBottom: 80 }}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
          ListHeaderComponent={
            <Txt v="small">
              {complete ? t('{n} NFTs', { n: count.toLocaleString(locale()) }) : t('{n} NFTs hasta ahora · cargando más…', { n: count.toLocaleString(locale()) })}
            </Txt>
          }
          ListFooterComponent={err && count ? <Notice kind="warn">{t('No se pudieron cargar todos los NFTs')}</Notice> : null}
        />
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
