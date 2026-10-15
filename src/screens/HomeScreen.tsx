import React, { useMemo } from 'react';
import { t } from '../i18n';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp, signedWeight } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { AccountAvatar, AccountGlyph, Badge, Button, Card, Empty, IconButton, Logo, QuorumRing, Screen, Section, Txt, XrpMark, accountIcon, tap, NativeSeg } from '../ui/components';
import { C, F, SP, accountColor, alpha as alphaC } from '../ui/theme';
import { minSigners, vaultHealth } from '../core/health';
import { Account } from '../store';
import { formatFiat } from '../core/market';
import { NftImage } from '../ui/NftImage';
import { useGalleryPrefetch, useNftAvatarCheck, usePinnedNftSync } from '../ui/nftAvatars';
import { useNativeSelectors } from '../ui/Glass';

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
  useNftAvatarCheck();
  useGalleryPrefetch();
  usePinnedNftSync();

  const vaults = app.accounts.filter((a) => a.kind === 'vault');
  const wallets = app.accounts.filter((a) => a.kind === 'wallet');
  const pending = app.proposals.filter((p) => p.status === 'collecting' || p.status === 'ready');

  const totals = useMemo(() => {
    let main = 0;
    let test = 0;
    let stableFiat = 0;
    const seen = new Set<string>(); // la misma dirección agregada dos veces se cuenta una vez
    for (const a of app.accounts) {
      if (a.excluded) continue;
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
  const excludedCount = app.accounts.filter((a) => a.excluded).length;
  const heroXrp = onlyTest ? totals.test : totals.main;
  // en XRP: saldo real de XRP; en divisa: XRP + stablecoins
  const inXrp = onlyTest || !m.price || app.settings.balanceUnit === 'xrp';

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
      {/* Patrimonio: al tocarlo se abre su gráfico; el selector cambia entre la divisa y XRP */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable
          onPress={() => nav.push('charts', { view: 'portfolio' })}
          accessibilityLabel={t('Ver gráfico del patrimonio')}
          hitSlop={6}
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, flexDirection: 'row', alignItems: 'center', gap: 4 })}
        >
          <Txt v="label">{onlyTest ? 'Saldo en testnet' : 'Patrimonio total'}</Txt>
          <Feather name="chevron-right" size={14} color={C.dim} />
        </Pressable>
        {!onlyTest && m.price ? <UnitToggle /> : null}
      </View>
      <Pressable
        onPress={() => nav.push('charts', { view: 'portfolio' })}
        accessibilityLabel={t('Ver gráfico del patrimonio')}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, alignSelf: 'flex-start' })}
      >
        {inXrp ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
            <XrpMark size={34} color={C.text} />
            <Text style={{ fontFamily: F.bold, fontSize: 44, color: C.text, letterSpacing: -1.5 }}>{m.xrp(heroXrp)}</Text>
          </View>
        ) : (
          <Text style={{ fontFamily: F.bold, fontSize: 44, color: C.text, letterSpacing: -1.5, marginTop: 2 }}>
            {m.fiatRaw(heroXrp * m.price! + totals.stableFiat)}
          </Text>
        )}
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
        {!onlyTest && m.price ? (
          <Txt v="body" color={C.dim}>
            {inXrp
              ? `≈ ${m.fiatRaw(heroXrp * m.price)}`
              : totals.stableFiat > 0 ? t('{a} XRP + {b} en stablecoins', { a: m.xrp(heroXrp), b: m.fiatRaw(totals.stableFiat) }) : `${m.xrp(heroXrp)} XRP`}
          </Txt>
        ) : null}
        {excludedCount > 0 ? (
          <Pressable onPress={() => nav.push('charts', { view: 'portfolio' })} hitSlop={6}>
            <Badge text={excludedCount === 1 ? t('1 cuenta fuera del total') : t('{n} cuentas fuera del total', { n: excludedCount })} color={C.dim} icon="eye-off" />
          </Pressable>
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

/** Selector XRP / divisa para los saldos de Inicio. */
function UnitToggle() {
  const app = useApp();
  const m = useMoney();
  const unit = app.settings.balanceUnit;
  const nativeSel = useNativeSelectors();
  const opt = (k: 'xrp' | 'fiat', label: React.ReactNode, a11y: string) => {
    const on = unit === k;
    return (
      <Pressable
        accessibilityLabel={a11y}
        accessibilityState={{ selected: on }}
        hitSlop={6}
        onPress={() => {
          if (on) return;
          tap();
          app.updateSettings({ balanceUnit: k });
        }}
        style={{ paddingHorizontal: 10, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.green : 'transparent' }}
      >
        {label}
      </Pressable>
    );
  };
  const ink = (on: boolean) => (on ? C.greenInk : C.dim);
  // iOS 26 con selectores nativos: el mismo selector de vidrio que en el resto de la app
  if (nativeSel) {
    return (
      <NativeSeg
        value={unit}
        options={[
          { value: 'xrp', label: 'XRP' },
          { value: 'fiat', label: m.fiat.toUpperCase() },
        ]}
        onChange={(k) => app.updateSettings({ balanceUnit: k })}
        style={{ width: 124, height: 30 }}
      />
    );
  }
  return (
    <View style={{ flexDirection: 'row', padding: 2, borderRadius: 15, borderWidth: 1, borderColor: C.lineStrong, backgroundColor: C.surface }}>
      {opt('xrp', <XrpMark size={13} color={ink(unit === 'xrp')} />, t('Saldos en XRP'))}
      {opt('fiat', <Text style={{ fontFamily: F.semibold, fontSize: 12, color: ink(unit === 'fiat') }}>{m.fiat.toUpperCase()}</Text>, t('Saldos en {x}', { x: m.fiat.toUpperCase() }))}
    </View>
  );
}

/** Saldo de una cuenta según la unidad elegida: el grande y el secundario. */
function useBalance(a: Account) {
  const app = useApp();
  const m = useMoney();
  const st = app.stateOf(a);
  if (!st) return { main: '…', sub: '', xrp: false };
  const fiatV = m.accountFiatValue(st, a.network);
  if (app.settings.balanceUnit === 'xrp' || fiatV == null) {
    return { main: m.xrp(st.balanceXrp), sub: a.network === 'testnet' ? t('XRP de prueba') : m.fiatOf(st.balanceXrp, a.network), xrp: true };
  }
  return { main: m.fiatRaw(fiatV), sub: `${m.xrp(st.balanceXrp)} XRP`, xrp: false };
}

function VaultCard({ a }: { a: Account }) {
  const app = useApp();
  const nav = useNav();
  const st = app.stateOf(a);
  const h = vaultHealth(st);
  const lv = LEVEL[h.level];
  const list = st?.signerList;
  const c = accountColor(a.color);
  const bal = useBalance(a);
  const pend = app.proposals.filter((p) => p.account === a.address && p.network === a.network && p.status === 'collecting');
  // Cuántos de sus firmantes están en este teléfono (0: solo lectura, como una cuenta sin llave).
  const here = list ? list.entries.filter((e) => app.deviceFor(e.account)).length : app.deviceFor(a.address) ? 1 : 0;
  return (
    <Card onPress={() => nav.push('account', { id: a.id })} style={{ padding: SP.lg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.lg }}>
        <QuorumRing size={68} color={c} segments={list ? list.entries.map((e) => ({ weight: e.weight, on: h.level === 'secure' })) : [{ weight: 1, on: false }]}>
          <View style={{ width: a.nft ? 52 : 46, height: a.nft ? 52 : 46, borderRadius: 26, overflow: 'hidden', backgroundColor: alphaC(c, 0.16), alignItems: 'center', justifyContent: 'center' }}>
            {a.nft ? <NftImage src={a.nft.image} size={18} /> : <AccountGlyph icon={accountIcon(a)} size={20} color={c} />}
          </View>
        </QuorumRing>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Txt v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>
              {a.label}
            </Txt>
            {a.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {bal.xrp && <XrpMark size={17} color={C.text} />}
            <Text style={{ fontFamily: F.bold, fontSize: 22, color: C.text }}>{bal.main}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge text={lv.text} color={lv.color} icon={lv.icon} />
            {list ? <Txt v="small">{t('{n} de {m} firmas', { n: minSigners(list), m: list.entries.length })}</Txt> : null}
            {pend.length ? <Badge text={t('{n} por firmar', { n: pend.length })} color={C.warn} icon="edit-3" /> : null}
          </View>
          {st ? (
            <Txt v="small">{here === 0 ? 'Solo lectura' : list ? t('Firmantes en este teléfono: {n} de {m}', { n: here, m: list.entries.length }) : null}</Txt>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function WalletRow({ a }: { a: Account }) {
  const app = useApp();
  const nav = useNav();
  const dev = app.deviceFor(a.address);
  const bal = useBalance(a);
  return (
    <Card onPress={() => nav.push('account', { id: a.id })} style={{ paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <AccountAvatar color={a.color} icon={accountIcon(a, dev)} nft={a.nft?.image} />
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            {bal.xrp && <XrpMark size={14} color={C.text} />}
            <Txt v="h3">{bal.main}</Txt>
          </View>
          <Txt v="small">{bal.sub}</Txt>
        </View>
      </View>
    </Card>
  );
}
