import React from 'react';
import { Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { AccountAvatar, Badge, Card, Screen, Txt, tap } from '../ui/components';
import { C, SP } from '../ui/theme';
import { AccountKind } from '../store';

/** Ordenar bóvedas o cuentas con flechas; el orden se guarda al instante. */
export default function ReorderScreen({ kind }: { kind: AccountKind }) {
  const app = useApp();
  const nav = useNav();
  const items = app.accounts.filter((a) => a.kind === kind);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((a) => a.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    tap();
    app.reorderAccounts(kind, ids);
  };

  const Arrow = ({ icon, disabled, onPress }: { icon: 'chevron-up' | 'chevron-down'; disabled: boolean; onPress: () => void }) => (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.raised, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}
    >
      <Feather name={icon} size={20} color={C.text} />
    </Pressable>
  );

  return (
    <Screen title={kind === 'vault' ? 'Ordenar bóvedas' : 'Ordenar cuentas'} onBack={nav.pop}>
      <Txt v="small" style={{ marginBottom: SP.md }}>
        Usa las flechas para cambiar el orden en Inicio. Se guarda solo.
      </Txt>
      {items.map((a, i) => {
        const dev = app.deviceFor(a.address);
        return (
          <Card key={a.id} style={{ paddingVertical: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <AccountAvatar
                color={a.color}
                size={36}
                icon={kind === 'vault' ? 'lock' : dev ? (dev.kind === 'ledger' ? 'cpu' : dev.kind === 'tangem' ? 'credit-card' : 'smartphone') : 'eye'}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Txt v="body" numberOfLines={1}>
                  {a.label}
                </Txt>
                {a.network === 'testnet' ? <Badge text="Testnet" color={C.test} /> : null}
              </View>
              <Arrow icon="chevron-up" disabled={i === 0} onPress={() => move(i, -1)} />
              <Arrow icon="chevron-down" disabled={i === items.length - 1} onPress={() => move(i, 1)} />
            </View>
          </Card>
        );
      })}
    </Screen>
  );
}
