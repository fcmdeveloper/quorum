import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { locale } from '../i18n';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useMoney } from '../ui/money';
import { Badge, Card, Empty, Screen, Segmented, Txt } from '../ui/components';
import { C, F, SP } from '../ui/theme';
import { ActivityItem, NETWORKS, NetworkId, fetchActivity } from '../core/network';
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

export default function ActivityScreen() {
  const app = useApp();
  const [items, setItems] = useState<(ActivityItem & { network: NetworkId; label: string })[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const all = await Promise.all(
      app.accounts.map(async (a) => {
        try {
          const list = await fetchActivity(a.network, a.address, 25);
          return list.map((x) => ({ ...x, network: a.network, label: a.label }));
        } catch {
          return [];
        }
      }),
    );
    // Una transacción entre dos cuentas propias aparece una sola vez (la de quien envía)
    const seen = new Set<string>();
    const merged = all
      .flat()
      .sort((x, y) => y.date - x.date)
      .filter((x) => {
        const k = x.hash;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    setItems(merged);
  }, [app.accounts]);

  useEffect(() => {
    load();
  }, [load]);

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
      {items === null ? (
        <Txt v="small">Cargando movimientos…</Txt>
      ) : groups.length === 0 ? (
        <Empty icon="activity" title="Sin movimientos" text="Cuando tus cuentas envíen o reciban, lo verás aquí." />
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
    </Screen>
  );
}
