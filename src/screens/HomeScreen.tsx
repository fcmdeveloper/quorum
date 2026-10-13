import React, { useMemo } from 'react';
import { t } from '../i18n';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp, signedWeight } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { AccountAvatar, Badge, Button, Card, Empty, IconButton, Logo, QuorumRing, Screen, Section, Txt } from '../ui/components';
import { C, F, SP, accountColor } from '../ui/theme';
import { minSigners, vaultHealth } from '../core/health';
import { Account } from '../store';
import { formatFiat } from '../core/market';

const LEVEL = {
  // getters: el color se lee al dibujar (cambia con el tema)
  get secure() {
    return { color: C.green, text: 'Protegida', icon: 'shield' as const };
  },
  get partial() {
    return { color: C.warn, text: 'Incompleta', icon: 'alert-circle' as const };
  },
  get open() {
    return { color: C.bad, text: 'Sin protección', icon: 'alert-triangle' as const };
  },
  get unknown() {
    return { color: C.faint, text: 'Sin datos', icon: 'circle' as const };
  },
};

export default function HomeScreen() {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const [refreshing, setRefreshing] = React.useState(false);

  const vaults = app.accounts.filter((a) => a.kind === 'vault');
  const wallets = app.accounts.filter((a) => a.kind === 'wallet');
  const pending = app.proposals.filter((p) => p.status === 'collecting' || p.status === 'ready');

  const totals = useMemo(() => {
    let main = 0;
    let test = 0;
    let stableFiat = 0;
    const seen = new Set<string>(); // la misma dirección agregada dos veces se cuenta una vez
    for (const a of app.accounts) {
      const st = app.stateOf(a);
      if (!st) continue;
      const k = `${a.network}:${a.address}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (a.network === 'mainnet') {
        main += Number(st.balanceXrp);
        for (const t of st.tokens) {
          const v = m.tokenFiatValue(Number(t.balance), { currency: t.currency, issuer: t.issuer }, a.network);
          if (v) stableFiat += v;
        }
      } else test += Number(st.balanceXrp);
    }
    return { main, test, stableFiat };
  }, [app.accounts, app.states, m.price]);

  const onlyTest = totals.main === 0 && totals.test > 0;
  const heroXrp = onlyTest ? totals.test : totals.main;

  return (
    <Screen
      top={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            onPress={() => nav.push('about', {})}
            accessibilityLabel="Acerca de Quorum"
            hitSlop={8}
            style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, opacity: pressed ? 0.6 : 1 })}
          >
            <Logo size={34} />
            <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text, letterSpacing: -0.4 }}>Quorum</Text>
          </Pressable>
          <IconButton
            icon={app.settings.hideBalances ? 'eye-off' : 'eye'}
            label="Ocultar saldos"
            onPress={() => app.updateSettings({ hideBalances: !app.settings.hideBalances })}
          />
        </View>
      }
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await app.refreshAll();
        setRefreshing(false);
      }}
    >
      {/* Patrimonio: al tocarlo se abre su gráfico */}
      <Pressable
        onPress={() => nav.push('charts', { view: 'portfolio' })}
        accessibilityLabel={t('Ver gráfico del patrimonio')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Txt v="label">{onlyTest ? 'Saldo en testnet' : 'Patrimonio total'}</Txt>
          <Feather name="chevron-right" size={14} color={C.dim} />
        </View>
        <Text style={{ fontFamily: F.bold, fontSize: 44, color: C.text, letterSpacing: -1.5, marginTop: 2 }}>
          {onlyTest ? `${m.xrp(heroXrp)} XRP` : m.price ? m.fiatRaw(heroXrp * m.price + totals.stableFiat) : `${m.xrp(heroXrp)} XRP`}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
        {!onlyTest && m.price ? (
          <Txt v="body" color={C.dim}>
            {m.xrp(heroXrp)} XRP{totals.stableFiat > 0 ? ` + ${m.fiatRaw(totals.stableFiat)} en stablecoins` : ''}
          </Txt>
        ) : null}
        {m.price ? (
          <Pressable
            onPress={() => nav.push('charts', { view: 'market' })}
            accessibilityLabel={t('Ver gráfico del precio de XRP')}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Badge
              text={`XRP ${formatFiat(m.price, m.fiat)}  ${m.change! >= 0 ? '+' : ''}${m.change!.toFixed(1)}%`}
              color={m.change! >= 0 ? C.green : C.bad}
              icon={m.change! >= 0 ? 'trending-up' : 'trending-down'}
            />
          </Pressable>
        ) : null}
      </View>

      {pending.length > 0 && (
        <Card onPress={() => nav.setTab('proposals')} style={{ marginTop: SP.xl, borderColor: C.warn + '55', backgroundColor: C.warnBg }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="edit-3" size={20} color={C.warn} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">
                {pending.length} {pending.length === 1 ? 'operación espera firmas' : 'operaciones esperan firmas'}
              </Txt>
              <Txt v="small">Toca para revisar y firmar</Txt>
            </View>
            <Feather name="chevron-right" size={18} color={C.warn} />
          </View>
        </Card>
      )}

      {app.accounts.length === 0 ? (
        <Empty
          icon="lock"
          title="Tu primera bóveda"
          text="Une tus Tangem, Ledger o Xaman en una cuenta que solo se mueve con varias firmas."
          action={
            <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
              <Button title="Crear bóveda" icon="plus" onPress={() => nav.push('vaultWizard', {})} />
              <Button title="Agregar una cuenta" kind="ghost" onPress={() => nav.push('addAccount', {})} />
            </View>
          }
        />
      ) : (
        <>
          <Section
            title="Bóvedas"
            action={
              <View style={{ flexDirection: 'row', gap: 18 }}>
                {vaults.length > 1 && (
                  <Pressable onPress={() => nav.push('reorder', { kind: 'vault' })} hitSlop={10}>
                    <Txt v="label" color={C.dim}>
                      Ordenar
                    </Txt>
                  </Pressable>
                )}
                <Pressable onPress={() => nav.push('vaultWizard', {})} hitSlop={10}>
                  <Txt v="label" color={C.green}>
                    Nueva
                  </Txt>
                </Pressable>
              </View>
            }
          >
            {vaults.length === 0 ? (
              <Card onPress={() => nav.push('vaultWizard', {})}>
                <Txt v="body">Crea una bóveda multifirma</Txt>
                <Txt v="small">Tus fondos de largo plazo, protegidos por varios dispositivos.</Txt>
              </Card>
            ) : (
              vaults.map((a) => <VaultCard key={a.id} a={a} />)
            )}
          </Section>

          <Section
            title="Cuentas"
            action={
              <View style={{ flexDirection: 'row', gap: 18 }}>
                {wallets.length > 1 && (
                  <Pressable onPress={() => nav.push('reorder', { kind: 'wallet' })} hitSlop={10}>
                    <Txt v="label" color={C.dim}>
                      Ordenar
                    </Txt>
                  </Pressable>
                )}
                <Pressable onPress={() => nav.push('addAccount', {})} hitSlop={10}>
                  <Txt v="label" color={C.green}>
                    Agregar
                  </Txt>
                </Pressable>
              </View>
            }
          >
            {wallets.length === 0 ? (
              <Card onPress={() => nav.push('addAccount', {})}>
                <Txt v="body">Agrega una cuenta de uso diario</Txt>
                <Txt v="small">Firmada por un solo dispositivo, para pagos y movimientos.</Txt>
              </Card>
            ) : (
              wallets.map((a) => <WalletRow key={a.id} a={a} />)
            )}
          </Section>
        </>
      )}
    </Screen>
  );
}

function VaultCard({ a }: { a: Account }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const st = app.stateOf(a);
  const h = vaultHealth(st);
  const lv = LEVEL[h.level];
  const list = st?.signerList;
  const pend = app.proposals.filter((p) => p.account === a.address && p.network === a.network && p.status === 'collecting');
  return (
    <Card onPress={() => nav.push('account', { id: a.id })} style={{ padding: SP.lg, borderLeftWidth: 3, borderLeftColor: accountColor(a.color) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.lg }}>
        <QuorumRing
          size={68}
          segments={list ? list.entries.map((e) => ({ weight: e.weight, on: h.level === 'secure' })) : [{ weight: 1, on: false }]}
          center={list ? `${minSigners(list)}/${list.entries.length}` : '—'}
        />
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: accountColor(a.color) }} />
            <Txt v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {a.label}
            </Txt>
            {a.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text }}>{st ? `${m.xrp(st.balanceXrp)} XRP` : '…'}</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Badge text={lv.text} color={lv.color} icon={lv.icon} />
            {pend.length ? <Badge text={t('{n} por firmar', { n: pend.length })} color={C.warn} icon="edit-3" /> : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function WalletRow({ a }: { a: Account }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const st = app.stateOf(a);
  const dev = app.deviceFor(a.address);
  return (
    <Card onPress={() => nav.push('account', { id: a.id })} style={{ paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AccountAvatar color={a.color} icon={dev ? (dev.kind === 'ledger' ? 'cpu' : dev.kind === 'tangem' ? 'credit-card' : 'smartphone') : 'eye'} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Txt v="body" numberOfLines={1} style={{ flexShrink: 1 }}>
              {a.label}
            </Txt>
            {a.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
          </View>
          <Txt v="small">{dev ? dev.label : 'Solo lectura'}</Txt>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Txt v="h3">{st ? `${m.xrp(st.balanceXrp)} XRP` : '…'}</Txt>
          <Txt v="small">{st ? m.fiatOf(st.balanceXrp, a.network) : ''}</Txt>
        </View>
      </View>
    </Card>
  );
}
