import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { locale } from '../i18n';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useMoney } from '../ui/money';
import { Badge, Button, Card, Empty, Screen, Segmented, Txt } from '../ui/components';
import { XrpLoader } from '../ui/XrpLoader';
import { C, F, SP } from '../ui/theme';
import { ActivityItem, NETWORKS, NetworkId, fetchActivityPage } from '../core/network';
import { FeedSource, Period, hasMore, mergeFeed, periodStart, sourcesToLoad } from '../core/activityFeed';
import { lookalikeOf, trustedAddresses } from '../core/lookalike';
import { t } from '../i18n';

type Filter = 'all' | 'in' | 'out' | 'config';

const ICON: Record<ActivityItem['kind'], React.ComponentProps<typeof Feather>['name']> = {
  in: 'arrow-down-left',
  out: 'arrow-up-right',
  config: 'sliders',
  dex: 'repeat',
  nft: 'image',
  other: 'activity',
};

export function ActivityRow({ it, network, accountLabel }: { it: ActivityItem; network: NetworkId; accountLabel?: string }) {
  const m = useMoney();
  const app = useApp();
  const color = !it.success ? C.bad : it.kind === 'in' ? C.green : it.kind === 'out' ? C.text : C.dim;
  const other = it.counterparty
    ? app.contacts.find((c) => c.address === it.counterparty)?.label ??
      app.accounts.find((a) => a.address === it.counterparty)?.label ??
      `${it.counterparty.slice(0, 6)}…${it.counterparty.slice(-4)}`
    : undefined;
  const sign = it.kind === 'in' ? '+' : it.kind === 'out' ? '−' : '';
  // movimiento con una dirección que imita a una de confianza: posible estafa
  const twin = it.counterparty ? lookalikeOf(it.counterparty, trustedAddresses(app)) : null;
  return (
    <Pressable
      onPress={() => Linking.openURL(`${NETWORKS[network].explorer}/transactions/${it.hash}`)}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }, pressed && { opacity: 0.6 }]}
    >
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: it.kind === 'in' ? C.greenGlow : C.raised,
        }}
      >
        <Feather name={it.success ? ICON[it.kind] : 'x'} size={18} color={it.success ? (it.kind === 'in' ? C.green : C.dim) : C.bad} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          <Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>
            {it.title}
          </Txt>
          {it.multisig && <Feather name="users" size={12} color={C.green} />}
        </View>
        {twin ? (
          <View style={{ alignSelf: 'flex-start', marginVertical: 2 }}>
            <Badge text={t('Imita a «{l}»: no la copies', { l: twin.label })} color={C.bad} icon="alert-triangle" />
          </View>
        ) : null}
        <Txt v="small" numberOfLines={1}>
          {[accountLabel, other, new Date(it.date).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })]
            .filter(Boolean)
            .join('  ·  ')}
        </Txt>
      </View>
      {it.xrp || it.token ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color }}>
            {it.xrp ? `${sign}${m.xrp(it.xrp)} XRP` : `${sign}${it.token}`}
          </Text>
          {it.xrp ? <Txt v="small">{m.fiatOf(it.xrp, network)}</Txt> : null}
        </View>
      ) : !it.success ? (
        <Badge text="Falló" color={C.bad} />
      ) : null}
    </Pressable>
  );
}

function dayLabel(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoy';
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

type Row = ActivityItem & { network: NetworkId; label: string };
const PAGE = 25;
/** Tope de páginas por cuenta al cubrir un período (25 × 12 = 300 movimientos). */
const MAX_PAGES = 12;

export default function ActivityScreen() {
  const app = useApp();
  const [sources, setSources] = useState<FeedSource<Row>[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [period, setPeriod] = useState<Period>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pages = useRef<Record<string, number>>({});
  const gen = useRef(0);

  const page = async (a: (typeof app.accounts)[number], marker?: unknown): Promise<Partial<FeedSource<Row>>> => {
    try {
      const r = await fetchActivityPage(a.network, a.address, PAGE, marker);
      return { items: r.items.map((x) => ({ ...x, network: a.network, label: a.label })), marker: r.marker, done: !r.marker };
    } catch {
      return { items: [], done: true };
    }
  };

  /** Primera página de cada cuenta (al abrir y al deslizar para actualizar). */
  const load = useCallback(async () => {
    const g = ++gen.current;
    const list = await Promise.all(
      app.accounts.map(async (a) => {
        const key = `${a.network}:${a.address}`;
        pages.current[key] = 1;
        const p = await page(a);
        return { key, items: p.items ?? [], marker: p.marker, done: !!p.done } as FeedSource<Row>;
      }),
    );
    if (g === gen.current) setSources(list);
  }, [app.accounts]);

  /** Pide la página siguiente a las cuentas que lo necesitan (para cubrir el período o "cargar más"). */
  const more = useCallback(
    async (cur: FeedSource<Row>[], from: number | null) => {
      // Al cubrir un período hay tope de páginas por cuenta; "cargar más" no lo tiene (lo pide el usuario)
      const want = sourcesToLoad(cur, from).filter((s) => from === null || (pages.current[s.key] ?? 1) < MAX_PAGES);
      if (!want.length) return cur;
      const g = gen.current;
      setLoadingMore(true);
      const next = await Promise.all(
        cur.map(async (s) => {
          if (!want.includes(s)) return s;
          const a = app.accounts.find((x) => `${x.network}:${x.address}` === s.key);
          if (!a) return { ...s, done: true };
          pages.current[s.key] = (pages.current[s.key] ?? 1) + 1;
          const p = await page(a, s.marker);
          return { ...s, items: [...s.items, ...(p.items ?? [])], marker: p.marker, done: !!p.done };
        }),
      );
      setLoadingMore(false);
      if (g !== gen.current) return cur;
      setSources(next);
      return next;
    },
    [app.accounts],
  );

  useEffect(() => {
    load();
  }, [load]);

  const from = useMemo(() => periodStart(period, Date.now()), [period]);

  // Al elegir un período, se piden páginas hasta cubrirlo (con tope por cuenta)
  useEffect(() => {
    if (!sources || from === null || loadingMore || !hasMore(sources, from)) return;
    more(sources, from);
  }, [sources, from]);

  const items = useMemo(() => (sources ? mergeFeed(sources, from) : null), [sources, from]);
  const canLoadMore = !!sources && period === 'all' && hasMore(sources, null);

  const shown = useMemo(() => {
    if (!items) return [];
    if (filter === 'all') return items;
    if (filter === 'config') return items.filter((i) => i.kind === 'config');
    return items.filter((i) => i.kind === filter);
  }, [items, filter]);

  const groups = useMemo(() => {
    const g: { day: string; list: typeof shown }[] = [];
    for (const it of shown) {
      const d = dayLabel(it.date);
      const last = g[g.length - 1];
      if (last && last.day === d) last.list.push(it);
      else g.push({ day: d, list: [it] });
    }
    return g;
  }, [shown]);

  return (
    <Screen
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <Txt v="h1" style={{ marginBottom: SP.lg }}>
        Actividad
      </Txt>
      <Segmented<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { value: '7d', label: '7 días' },
          { value: '30d', label: '30 días' },
          { value: 'year', label: 'Este año' },
          { value: 'all', label: 'Todo' },
        ]}
      />
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'Todo' },
          { value: 'in', label: 'Entradas' },
          { value: 'out', label: 'Salidas' },
          { value: 'config', label: 'Ajustes' },
        ]}
      />
      {items === null || (groups.length === 0 && loadingMore) ? (
        <View style={{ paddingVertical: SP.xxl }}>
          <XrpLoader size={60} />
        </View>
      ) : groups.length === 0 ? (
        <Empty icon="activity" title="Sin movimientos" text={period === 'all' ? 'Cuando tus cuentas envíen o reciban, lo verás aquí.' : 'No hay movimientos en este período.'} />
      ) : (
        groups.map((g) => (
          <View key={g.day} style={{ marginBottom: SP.md }}>
            <Txt v="label" style={{ marginBottom: 4, marginTop: SP.sm }}>
              {g.day}
            </Txt>
            <Card style={{ paddingVertical: 2 }}>
              {g.list.map((it) => (
                <ActivityRow key={it.hash} it={it} network={it.network} accountLabel={it.label} />
              ))}
            </Card>
          </View>
        ))
      )}
      {items && groups.length > 0 && loadingMore ? (
        <View style={{ paddingVertical: SP.lg }}>
          <XrpLoader size={40} label={null} delay={0} />
        </View>
      ) : canLoadMore ? (
        <Button title="Cargar más" kind="ghost" icon="chevron-down" onPress={() => sources && more(sources, null)} style={{ marginTop: SP.sm }} />
      ) : null}
    </Screen>
  );
}
