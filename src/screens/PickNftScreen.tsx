/**
 * Elegir un NFT como imagen de una cuenta o bóveda. Se puede usar cualquier NFT de las
 * cuentas que tienes en Quorum (también las de solo lectura, en un grupo aparte).
 * Es solo decorativo: vive en este teléfono y no da permisos de nada.
 */
import React, { useEffect, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { t } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Screen, Section, Txt, tap, toast } from '../ui/components';
import { C, R, SP, accountColor } from '../ui/theme';
import { NftImage } from '../ui/NftImage';
import { NftItem, fetchNfts } from '../core/network';
import { loadMetaParallel, withCachedMeta } from '../core/nftCache';
import { Account } from '../store';
import { QUORUM } from '../config';

const W = Dimensions.get('window').width;
const COLS = 3;
const GAP = SP.sm;
const TILE = Math.floor((W - SP.lg * 2 - GAP * (COLS - 1)) / COLS);

/** Una cuenta es "de solo lectura" si en este teléfono no tienes cómo firmar por ella. */
export function useIsReadOnly() {
  const app = useApp();
  return (a: Account) => {
    if (a.kind === 'wallet') return !app.deviceFor(a.address);
    const list = app.stateOf(a)?.signerList;
    if (!list) return false;
    return !list.entries.some((e) => app.deviceFor(e.account));
  };
}

/** La galería pública se lee como si fuera una cuenta más (solo para mirar). */
const GALLERY: Account = { id: 'quorum-gallery', label: 'Galería de Quorum', kind: 'wallet', network: 'mainnet', address: QUORUM.nftGalleryAddress, createdAt: 0, color: 'green' };

function AccountNfts({ source, selectedId, onPick, hideHead }: { source: Account; selectedId?: string; onPick: (n: NftItem, source: Account) => void; hideHead?: boolean }) {
  const [items, setItems] = useState<NftItem[] | null>(null);
  // NFTs cuya metadata todavía se está leyendo (se muestran con un marcador mientras tanto)
  const [loading, setLoading] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const list = await fetchNfts(source.network, source.address);
        const { items: cached, pending } = await withCachedMeta(list);
        if (!alive) return;
        setItems(cached);
        setLoading(new Set(pending.map((n) => n.id)));
        await loadMetaParallel(
          pending,
          (r) => {
            setItems((prev) => (prev ? prev.map((n) => (n.id === r.id ? r : n)) : prev));
            setLoading((prev) => {
              const s = new Set(prev);
              s.delete(r.id);
              return s;
            });
          },
          () => alive,
        );
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [source.id]);

  const head = hideHead ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SP.sm }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accountColor(source.color) }} />
      <Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>
        {source.label}
      </Txt>
      {source.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
    </View>
  );
  if (items === null) {
    return (
      <View style={{ marginBottom: SP.lg }}>
        {head}
        <Txt v="small">Buscando NFTs…</Txt>
      </View>
    );
  }
  // solo los que tienen imagen sirven como avatar (los que aún cargan se muestran con un marcador)
  const withImage = items.filter((n) => n.image || loading.has(n.id));
  if (withImage.length === 0) return null;
  return (
    <View style={{ marginBottom: SP.lg }}>
      {head}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {withImage.map((n) => {
          const on = n.id === selectedId;
          if (!n.image) {
            return <View key={n.id} style={{ width: TILE, height: TILE, borderRadius: R.md, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, opacity: 0.6 }} />;
          }
          return (
            <Pressable
              key={n.id}
              accessibilityLabel={n.name ?? 'NFT'}
              onPress={() => {
                tap();
                onPick(n, source);
              }}
              style={({ pressed }) => ({
                width: TILE,
                height: TILE,
                borderRadius: R.md,
                overflow: 'hidden',
                backgroundColor: C.surface2,
                borderWidth: on ? 3 : 1,
                borderColor: on ? C.green : C.line,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <NftImage src={n.image} />
              {on && (
                <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name="check" size={14} color={C.greenInk} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function PickNftScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const readOnly = useIsReadOnly();
  const a = app.accounts.find((x) => x.id === id);
  if (!a) return null;
  // la cuenta de la galería ya aparece arriba: no se repite
  const isGallery = (x: Account) => x.network === 'mainnet' && x.address === QUORUM.nftGalleryAddress;
  const mine = app.accounts.filter((x) => !readOnly(x) && !isGallery(x));
  const others = app.accounts.filter((x) => readOnly(x) && !isGallery(x));
  const pick = async (n: NftItem, source: Account) => {
    await app.updateAccount(a.id, { nft: { id: n.id, image: n.image!, network: source.network, name: n.name, gallery: source.id === GALLERY.id || undefined } });
    toast(t('Imagen actualizada'));
    nav.pop();
  };
  return (
    <Screen title={t('NFT para {x}', { x: a.label })} onBack={nav.pop}>
      <Txt v="small" style={{ marginBottom: SP.lg }}>
        Elige un NFT de la galería de Quorum o de tus cuentas para reconocer esta de un vistazo. Es solo una imagen en este teléfono: no cambia nada en la red.
      </Txt>
      {a.nft && <Button title="Quitar el NFT" kind="ghost" icon="x" onPress={async () => { await app.updateAccount(a.id, { nft: undefined }); nav.pop(); }} />}
      {QUORUM.nftGalleryAddress ? (
        <Section title="Galería de Quorum">
          <Txt v="small" style={{ marginBottom: SP.md }}>
            Imágenes libres para todos los usuarios de Quorum.
          </Txt>
          <AccountNfts source={GALLERY} selectedId={a.nft?.id} onPick={pick} hideHead />
        </Section>
      ) : null}
      <Section title="Tus cuentas y bóvedas">
        {mine.map((x) => (
          <AccountNfts key={x.id} source={x} selectedId={a.nft?.id} onPick={pick} />
        ))}
      </Section>
      {others.length > 0 && (
        <Section title="Solo lectura">
          <Txt v="small" style={{ marginBottom: SP.md }}>
            Cuentas que agregaste solo para mirar. Quorum no puede comprobar que sean tuyas.
          </Txt>
          {others.map((x) => (
            <AccountNfts key={x.id} source={x} selectedId={a.nft?.id} onPick={pick} />
          ))}
        </Section>
      )}
      <Txt v="small" style={{ marginTop: SP.md }}>
        Solo aparecen los NFTs con imagen. Si una cuenta no aparece, es porque no tiene NFTs.
      </Txt>
    </Screen>
  );
}
