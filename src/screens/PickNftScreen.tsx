/**
 * Elegir un NFT como imagen de una cuenta o bóveda. Se puede usar cualquier NFT de las
 * cuentas que tienes en Quorum (también las de solo lectura, en un grupo aparte).
 * Es solo decorativo: vive en este teléfono y no da permisos de nada.
 */
import React, { useEffect, useRef, useState } from 'react';
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
import { BADGE_TAXON } from '../core/badges';
import { Account } from '../store';
import { QUORUM } from '../config';
import { XrpLoader } from '../ui/XrpLoader';

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

const STEP = 3;

/**
 * NFTs de una cuenta: muestra cuántos tiene y los carga de a 3 (una fila), con un indicador
 * mientras llega cada imagen. "Ver más" carga los siguientes, solo cuando el usuario lo pide.
 */
function AccountNfts({ source, selectedId, onPick, hideHead }: { source: Account; selectedId?: string; onPick: (n: NftItem, source: Account) => void; hideHead?: boolean }) {
  const [items, setItems] = useState<NftItem[] | null>(null);
  // metadata ya consultada (con o sin imagen) y la que está en camino
  const [done, setDone] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(STEP);
  const requested = useRef<Set<string>>(new Set());
  const alive = useRef(true);
  useEffect(() => () => {
    alive.current = false;
  }, []);

  useEffect(() => {
    (async () => {
      try {
        // las insignias de validador que la galería aún no entrega no son imágenes de uso público
        const list = (await fetchNfts(source.network, source.address)).filter((n) => !(source.id === GALLERY.id && n.taxon === BADGE_TAXON));
        const { items: cached, pending } = await withCachedMeta(list);
        if (!alive.current) return;
        const pend = new Set(pending.map((n) => n.id));
        setItems(cached);
        setDone(new Set(cached.filter((n) => !pend.has(n.id)).map((n) => n.id)));
      } catch {
        if (alive.current) setItems([]);
      }
    })();
  }, [source.id]);

  // candidatos: los que tienen imagen o aún no sabemos (los que de verdad no tienen imagen se omiten).
  // Los que fallaron por la red siguen siendo candidatos: muestran un botón para reintentar.
  const candidates = items ? items.filter((n) => n.image || !done.has(n.id)) : [];
  const visible = candidates.slice(0, limit);

  // si un NFT falla, se reintenta solo una vez (a los segundos) antes de pedirle al usuario
  const autoRetried = useRef<Set<string>>(new Set());
  const load = (need: NftItem[]) => {
    need.forEach((n) => requested.current.add(n.id));
    loadMetaParallel(
      need,
      (r) => {
        if (r.metaFailed && !autoRetried.current.has(r.id)) {
          autoRetried.current.add(r.id);
          setTimeout(() => alive.current && load([{ ...r, metaFailed: undefined }]), 2500);
          return;
        }
        setItems((prev) => (prev ? prev.map((n) => (n.id === r.id ? r : n)) : prev));
        if (!r.metaFailed) setDone((prev) => new Set(prev).add(r.id));
      },
      () => alive.current,
      STEP,
    );
  };

  // pide la metadata solo de lo que se ve
  useEffect(() => {
    const need = visible.filter((n) => !done.has(n.id) && !requested.current.has(n.id));
    if (need.length) load(need);
  }, [visible.map((n) => n.id).join(',')]);

  const retry = (n: NftItem) => {
    setItems((prev) => (prev ? prev.map((x) => (x.id === n.id ? { ...x, metaFailed: undefined } : x)) : prev));
    load([{ ...n, metaFailed: undefined }]);
  };

  if (items && items.length === 0) return null;

  const total = items?.length ?? 0;
  const remaining = Math.max(0, candidates.length - visible.length);
  const head = hideHead ? null : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: SP.sm }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accountColor(source.color) }} />
      <Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>
        {source.label}
      </Txt>
      {source.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
      {items ? <Txt v="small">{total === 1 ? t('1 NFT') : t('{n} NFTs', { n: total })}</Txt> : null}
    </View>
  );
  const placeholder = (key: string) => (
    <View key={key} style={{ width: TILE, height: TILE, borderRadius: R.md, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
      <XrpLoader size={44} />
    </View>
  );

  return (
    <View style={{ marginBottom: SP.lg }}>
      {head}
      {hideHead && items ? <Txt v="small" style={{ marginBottom: SP.sm }}>{total === 1 ? t('1 NFT') : t('{n} NFTs', { n: total })}</Txt> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>
        {items === null
          ? [0, 1, 2].map((i) => placeholder(`p${i}`))
          : visible.map((n) => {
              if (!n.image && n.metaFailed) {
                return (
                  <Pressable
                    key={n.id}
                    accessibilityLabel={t('Reintentar')}
                    onPress={() => {
                      tap();
                      retry(n);
                    }}
                    style={({ pressed }) => ({ width: TILE, height: TILE, borderRadius: R.md, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
                  >
                    <Feather name="refresh-cw" size={18} color={C.dim} />
                    <Txt v="small">{t('Reintentar')}</Txt>
                  </Pressable>
                );
              }
              if (!n.image) return placeholder(n.id);
              const on = n.id === selectedId;
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
      {remaining > 0 && (
        <Pressable
          onPress={() => {
            tap();
            setLimit((l) => l + STEP);
          }}
          hitSlop={8}
          style={({ pressed }) => ({ alignSelf: 'center', marginTop: SP.md, paddingHorizontal: SP.lg, height: 36, borderRadius: 18, borderWidth: 1, borderColor: C.lineStrong, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: pressed ? 0.6 : 1 })}
        >
          <Feather name="chevron-down" size={16} color={C.green} />
          <Txt v="label" color={C.green}>
            {t('Ver más ({n})', { n: remaining })}
          </Txt>
        </Pressable>
      )}
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
        Elige un NFT de tus cuentas o de la galería de Quorum para reconocer esta de un vistazo. Es solo una imagen en este teléfono: no cambia nada en la red.
      </Txt>
      {a.nft && <Button title="Quitar el NFT" kind="ghost" icon="x" onPress={async () => { await app.updateAccount(a.id, { nft: undefined }); nav.pop(); }} />}
      <Section title="Tus cuentas y bóvedas">
        {mine.map((x) => (
          <AccountNfts key={x.id} source={x} selectedId={a.nft?.id} onPick={pick} />
        ))}
      </Section>
      {QUORUM.nftGalleryAddress ? (
        <Section title="Galería de Quorum">
          <Txt v="small" style={{ marginBottom: SP.md }}>
            Imágenes libres para todos los usuarios de Quorum.
          </Txt>
          <AccountNfts source={GALLERY} selectedId={a.nft?.id} onPick={pick} hideHead />
        </Section>
      ) : null}
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
