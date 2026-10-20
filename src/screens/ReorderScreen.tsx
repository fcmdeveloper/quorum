import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { AccountAvatar, accountIcon, Badge, Screen, Txt, tap } from '../ui/components';
import { C, R, SP } from '../ui/theme';
import { t } from '../i18n';
import { Account, AccountKind } from '../store';

const ROW = 68; // alto fijo de cada fila (con su separación): así se calcula a qué lugar cae al soltar
const GAP = 8;

/**
 * Orden y visibilidad de bóvedas o cuentas en Inicio.
 * - Arrastrar desde la manija (≡) cambia el orden; se guarda al soltar.
 * - El interruptor la muestra u oculta en Inicio. Oculta, tampoco suma al patrimonio ni al gráfico.
 */
export default function ReorderScreen({ kind }: { kind: AccountKind }) {
  const app = useApp();
  const nav = useNav();
  const items = app.accounts.filter((a) => a.kind === kind);
  const [order, setOrder] = useState(items.map((a) => a.id));
  const [dragId, setDragId] = useState<string | null>(null);

  // si cambian las cuentas (alta o baja) mientras no se arrastra, se toma el orden guardado
  const savedKey = items.map((a) => a.id).join(',');
  useEffect(() => {
    if (!dragId) setOrder(items.map((a) => a.id));
  }, [savedKey]);

  const dragY = useRef(new Animated.Value(0)).current;
  const shifts = useRef(new Map<string, Animated.Value>()).current;
  const shiftOf = (id: string) => {
    let v = shifts.get(id);
    if (!v) shifts.set(id, (v = new Animated.Value(0)));
    return v;
  };
  const drag = useRef<{ id: string; from: number; to: number; ids: string[] } | null>(null);

  const begin = (id: string) => {
    const ids = order;
    const from = ids.indexOf(id);
    drag.current = { id, from, to: from, ids };
    dragY.setValue(0);
    setDragId(id);
    tap();
  };
  const move = (dy: number) => {
    const d = drag.current;
    if (!d) return;
    dragY.setValue(dy);
    const to = Math.max(0, Math.min(d.ids.length - 1, d.from + Math.round(dy / ROW)));
    if (to === d.to) return;
    d.to = to;
    tap();
    d.ids.forEach((id, k) => {
      if (id === d.id) return;
      const target = d.from < k && k <= to ? -ROW : to <= k && k < d.from ? ROW : 0;
      Animated.timing(shiftOf(id), { toValue: target, duration: 140, useNativeDriver: true }).start();
    });
  };
  const end = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const ids = [...d.ids];
    const [x] = ids.splice(d.from, 1);
    ids.splice(d.to, 0, x);
    ids.forEach((id) => shiftOf(id).setValue(0));
    dragY.setValue(0);
    setOrder(ids);
    setDragId(null);
    if (d.to !== d.from) app.reorderAccounts(kind, ids);
  };

  const byId = new Map(items.map((a) => [a.id, a]));
  const rows = order.map((id) => byId.get(id)).filter(Boolean) as Account[];
  const hiddenCount = rows.filter((a) => a.hidden).length;

  return (
    <Screen title="Orden y visibilidad" onBack={nav.pop} scrollEnabled={!dragId}>
      <Txt v="small" style={{ marginBottom: SP.md }}>
        {kind === 'vault'
          ? t('Arrastra desde ≡ para cambiar el orden de tus bóvedas en Inicio. Con el interruptor eliges cuáles se ven; las ocultas tampoco suman a Mi patrimonio.')
          : t('Arrastra desde ≡ para cambiar el orden de tus cuentas en Inicio. Con el interruptor eliges cuáles se ven; las ocultas tampoco suman a Mi patrimonio.')}
      </Txt>
      <View style={{ height: rows.length * ROW }}>
        {rows.map((a, i) => (
          <DragRow
            key={a.id}
            a={a}
            index={i}
            dragging={dragId === a.id}
            translate={dragId === a.id ? dragY : shiftOf(a.id)}
            onBegin={() => begin(a.id)}
            onMove={move}
            onEnd={end}
            onOpen={() => nav.push('account', { id: a.id })}
            onToggle={(on) => {
              tap();
              app.updateAccount(a.id, { hidden: on ? undefined : true });
            }}
          />
        ))}
      </View>
      {hiddenCount > 0 ? (
        <Txt v="small" style={{ marginTop: SP.sm }}>
          {hiddenCount === 1 ? t('1 oculta en Inicio. Tócala aquí para abrirla; sigue en Actividad y para firmar.') : t('{n} ocultas en Inicio. Tócalas aquí para abrirlas; siguen en Actividad y para firmar.', { n: hiddenCount })}
        </Txt>
      ) : null}
    </Screen>
  );
}

function DragRow({
  a,
  index,
  dragging,
  translate,
  onBegin,
  onMove,
  onEnd,
  onToggle,
  onOpen,
}: {
  a: Account;
  index: number;
  dragging: boolean;
  translate: Animated.Value;
  onBegin: () => void;
  onMove: (dy: number) => void;
  onEnd: () => void;
  onToggle: (on: boolean) => void;
  onOpen: () => void;
}) {
  const app = useApp();
  const dev = app.deviceFor(a.address);
  // las funciones cambian en cada render: el PanResponder (creado una vez) llama a las últimas
  const fns = useRef({ onBegin, onMove, onEnd });
  fns.current = { onBegin, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: () => fns.current.onBegin(),
      onPanResponderMove: (_, g) => fns.current.onMove(g.dy),
      onPanResponderRelease: () => fns.current.onEnd(),
      onPanResponderTerminate: () => fns.current.onEnd(),
    }),
  ).current;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: index * ROW,
        height: ROW - GAP,
        zIndex: dragging ? 10 : 1,
        transform: [{ translateY: translate }, { scale: dragging ? 1.03 : 1 }],
        shadowColor: '#000',
        shadowOpacity: dragging ? 0.35 : 0,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: dragging ? 8 : 0,
      }}
    >
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingRight: 12,
          borderRadius: R.lg,
          borderWidth: 1,
          borderColor: dragging ? C.green : C.line,
          backgroundColor: dragging ? C.surface2 : C.surface,
        }}
      >
        <View {...pan.panHandlers} style={{ alignSelf: 'stretch', width: 44, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={t('Arrastrar para ordenar')}>
          <Feather name="menu" size={20} color={dragging ? C.green : C.dim} />
        </View>
        <Pressable onPress={onOpen} style={{ opacity: a.hidden ? 0.45 : 1, flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1, alignSelf: 'stretch' }}>
          <AccountAvatar color={a.color} size={36} icon={accountIcon(a, dev)} nft={a.nft?.image} round={a.kind === 'vault'} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt v="body" numberOfLines={1}>
              {a.label}
            </Txt>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {a.network === 'testnet' ? <Badge text="Testnet" color={C.test} /> : null}
              {a.hidden ? <Badge text="Oculta" color={C.dim} icon="eye-off" /> : null}
            </View>
          </View>
        </Pressable>
        {/* caja de tamaño fijo: en iOS 26+ el interruptor nativo no se centra solo dentro de la fila */}
        <View style={{ width: 64, height: 32, alignItems: 'center', justifyContent: 'center' }}>
          <Switch
            value={!a.hidden}
            onValueChange={onToggle}
            trackColor={{ true: C.greenDeep, false: C.line }}
            thumbColor={C.text}
            accessibilityLabel={t('Mostrar {x} en Inicio', { x: a.label })}
          />
        </View>
      </View>
    </Animated.View>
  );
}
