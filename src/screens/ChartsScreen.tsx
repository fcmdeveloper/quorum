/**
 * Patrimonio y mercado: gráfico del valor de tus cuentas en el tiempo y del precio de XRP.
 * Se abre desde el inicio (tocando el patrimonio o el precio) y se puede cambiar entre ambos.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Switch, Text, View } from 'react-native';
import { t, locale } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { AccountAvatar, Badge, Button, Card, Notice, Row, Screen, Section, Segmented, Txt, accountIcon, tap } from '../ui/components';
import { LineChart } from '../ui/LineChart';
import { C, F, SP } from '../ui/theme';
import { FIATS, fetchXrpHistory, formatFiat, PricePoint, Range } from '../core/market';
import { BalanceHistory, fetchBalanceHistory, portfolioSeries } from '../core/history';
import { XrpLoader } from '../ui/XrpLoader';

export type ChartView = 'portfolio' | 'market';

const RANGES: { value: Range; label: string }[] = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
];

const RANGE_TEXT: Record<Range, string> = {
  day: 'Últimas 24 horas',
  week: 'Últimos 7 días',
  month: 'Últimos 30 días',
  year: 'Último año',
  all: 'Desde el inicio',
};

function fmtDate(ms: number, range: Range): string {
  const d = new Date(ms);
  const loc = locale();
  try {
    if (range === 'day') return d.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' });
    if (range === 'week') return d.toLocaleString(loc, { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    if (range === 'month') return d.toLocaleString(loc, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return d.toISOString().slice(0, 16).replace('T', ' ');
  }
}

export default function ChartsScreen({ view: initial }: { view: ChartView }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const fiat = app.settings.fiat;
  const [view, setView] = useState<ChartView>(initial);
  const [range, setRange] = useState<Range>('week');
  // precios por divisa y rango: al cambiar de rango nunca se muestran los datos del anterior
  const [byKey, setByKey] = useState<Record<string, { points: PricePoint[]; limited: boolean } | undefined>>({});
  const priceKey = `${fiat}:${range}`;
  const prices = byKey[priceKey]?.points ?? null;
  const limited = byKey[priceKey]?.limited ?? false;
  const [hist, setHist] = useState<BalanceHistory[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [reload, setReload] = useState(0);

  // Cuentas de mainnet (sin repetir dirección): las de testnet no tienen valor real.
  // `allMain` son todas; `mainnet`, las que suman (no excluidas del patrimonio).
  const allMain = useMemo(() => {
    const seen = new Set<string>();
    return app.accounts.filter((a) => a.network === 'mainnet' && !seen.has(a.address) && seen.add(a.address));
  }, [app.accounts.map((a) => `${a.network}:${a.address}`).join(',')]);
  const included = useMemo(
    () => new Set(app.accounts.filter((a) => a.network === 'mainnet' && !a.excluded && !a.hidden).map((a) => a.address)),
    [app.accounts],
  );
  const mainnet = useMemo(() => allMain.filter((a) => included.has(a.address)), [allMain, included]);
  const nowXrp = mainnet.reduce((s, a) => s + Number(app.stateOf(a)?.balanceXrp ?? 0), 0);
  const stableFiat = useMemo(() => {
    let v = 0;
    for (const a of mainnet) {
      for (const tk of app.stateOf(a)?.tokens ?? []) {
        v += m.tokenFiatValue(Number(tk.balance), { currency: tk.currency, issuer: tk.issuer }, a.network) ?? 0;
      }
    }
    return v;
  }, [mainnet, app.states, m.price]);

  // Precio del rango
  useEffect(() => {
    let alive = true;
    setErr(null);
    setLoading(true);
    setSel(null);
    fetchXrpHistory(fiat, range)
      .then((r) => alive && setByKey((m) => ({ ...m, [`${fiat}:${range}`]: r })))
      .catch((e) => alive && setErr(e.message ?? String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [fiat, range, reload]);

  // Historial de saldos (una vez; se guarda en caché unos minutos)
  useEffect(() => {
    if (view !== 'portfolio' || hist || !allMain.length) return;
    let alive = true;
    Promise.all(allMain.map((a) => fetchBalanceHistory('mainnet', a.address)))
      .then((h) => alive && setHist(h))
      .catch((e) => alive && setErr(e.message ?? String(e)));
    return () => {
      alive = false;
    };
  }, [view, hist, allMain, reload]);

  const series = useMemo(() => {
    if (!prices) return null;
    if (view === 'market') return prices.map((p) => ({ t: p.t, v: p.p, xrp: 0 }));
    if (!hist) return null;
    const use = hist.filter((_, i) => allMain[i] && included.has(allMain[i].address));
    if (!use.length) return null;
    return portfolioSeries(use, prices, m.price ? { xrp: nowXrp, price: m.price } : undefined);
  }, [view, prices, hist, nowXrp, m.price, included, allMain]);

  const first = series?.[0];
  const last = series?.[series.length - 1];
  const shown = sel !== null && series?.[sel] ? series[sel] : last;
  const delta = first && shown ? shown.v - first.v : 0;
  const pct = first && shown && first.v > 0 ? (delta / first.v) * 100 : null;
  const up = delta >= 0;
  const color = up ? C.green : C.bad;
  const hidden = view === 'portfolio' && app.settings.hideBalances;
  const money = (v: number) => (hidden ? '••••' : formatFiat(v, fiat));
  // Precio con 4 decimales bajo 10 (XRP se mueve en centavos)
  const priceFmt = (v: number) => {
    const sym = FIATS.find((f) => f.value === fiat)?.symbol ?? '';
    const d = v < 10 ? 4 : 2;
    return `${sym} ${v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d })}`;
  };

  const lo = series?.reduce((a, p) => Math.min(a, p.v), Infinity) ?? 0;
  const hi = series?.reduce((a, p) => Math.max(a, p.v), -Infinity) ?? 0;
  const partial = hist?.some((h) => h.partial);

  return (
    <Screen title={view === 'portfolio' ? 'Mi patrimonio' : 'Mercado XRP'} onBack={nav.pop}>
      <Segmented<ChartView>
        value={view}
        onChange={(v) => {
          setView(v);
          setSel(null);
        }}
        options={[
          { value: 'portfolio', label: 'Mi patrimonio' },
          { value: 'market', label: 'Mercado XRP' },
        ]}
      />

      <Txt v="label">{view === 'portfolio' ? 'Valor de tus cuentas' : t('Precio de XRP ({x})', { x: fiat.toUpperCase() })}</Txt>
      <Text style={{ fontFamily: F.bold, fontSize: 40, color: C.text, letterSpacing: -1.2, marginTop: 2 }}>
        {shown ? (view === 'market' ? priceFmt(shown.v) : money(shown.v)) : '—'}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, minHeight: 24 }}>
        {shown && first && pct !== null ? (
          <Badge
            text={`${up ? '+' : ''}${pct.toFixed(2)}%${view === 'portfolio' && !hidden ? `  ${up ? '+' : '−'}${formatFiat(Math.abs(delta), fiat)}` : ''}`}
            color={color}
            icon={up ? 'trending-up' : 'trending-down'}
          />
        ) : null}
        <Txt v="small" style={{ flexShrink: 1 }}>
          {sel !== null && shown ? fmtDate(shown.t, range) : t(RANGE_TEXT[range])}
        </Txt>
      </View>

      <View style={{ marginTop: SP.lg, marginHorizontal: -SP.lg }}>
        {series && series.length > 1 ? (
          <LineChart points={series} color={color} onScrub={setSel} />
        ) : (
          <View style={{ height: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SP.lg }}>
            {err ? (
              <View style={{ alignSelf: 'stretch' }}>
                <Notice kind="bad">{err}</Notice>
                <Button title="Reintentar" kind="ghost" onPress={() => setReload((n) => n + 1)} />
              </View>
            ) : view === 'portfolio' && !mainnet.length ? (
              <Txt v="small" style={{ textAlign: 'center' }}>
                Agrega una cuenta de mainnet para ver cómo evoluciona tu patrimonio.
              </Txt>
            ) : (
              <XrpLoader size={40} label={null} />
            )}
          </View>
        )}
      </View>

      <Segmented<Range> value={range} onChange={setRange} options={RANGES} />

      {series && series.length > 1 ? (
        <Card>
          {view === 'market' ? (
            <>
              <Row k={t('Precio actual')} v={m.price ? priceFmt(m.price) : '—'} />
              <Row k={t('Máximo del periodo')} v={priceFmt(hi)} />
              <Row k={t('Mínimo del periodo')} v={priceFmt(lo)} />
              {m.change != null ? <Row k={t('Cambio 24 h')} v={`${m.change >= 0 ? '+' : ''}${m.change.toFixed(2)}%`} /> : null}
            </>
          ) : (
            <>
              <Row k={t('Saldo en XRP')} v={hidden ? '••••' : `${m.xrp(shown?.xrp ?? 0)} XRP`} />
              <Row k={t('Máximo del periodo')} v={money(hi)} />
              <Row k={t('Mínimo del periodo')} v={money(lo)} />
              <Row k={t('Cuentas incluidas')} v={String(mainnet.length)} />
            </>
          )}
        </Card>
      ) : null}

      {view === 'portfolio' && <IncludedAccounts />}

      <View style={{ gap: SP.sm, marginTop: SP.md }}>
        {view === 'portfolio' ? (
          <>
            <Txt v="small">
              Se calcula con el saldo de XRP de tus cuentas de mainnet en cada momento y el precio de XRP de ese momento. Las cuentas de testnet no se incluyen.
            </Txt>
            {stableFiat > 0 ? <Txt v="small">No incluye stablecoins ni otros tokens.</Txt> : null}
            {partial ? <Txt v="small">Alguna cuenta tiene muchas transacciones: el historial más antiguo es aproximado.</Txt> : null}
          </>
        ) : null}
        {limited && range === 'all' ? <Txt v="small">El historial gratuito de precios no llega al inicio de XRP.</Txt> : null}
        <Txt v="small">Precios: CoinGecko o Kraken. Solo informativo.</Txt>
      </View>
    </Screen>
  );
}

/** Cuentas que suman al patrimonio, con un interruptor para incluirlas o no. */
function IncludedAccounts() {
  const app = useApp();
  const m = useMoney();
  const main = app.accounts.filter((a) => a.network === 'mainnet');
  const test = app.accounts.filter((a) => a.network === 'testnet');
  if (!app.accounts.length) return null;
  return (
    <Section title="Cuentas que suman">
      <Card style={{ paddingVertical: 4 }}>
        {main.map((a, i) => {
          const st = app.stateOf(a);
          const v = st ? m.accountFiatValue(st, a.network) : null;
          return (
            <View
              key={a.id}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderColor: C.line, opacity: a.excluded || a.hidden ? 0.55 : 1 }}
            >
              <AccountAvatar color={a.color} icon={accountIcon(a, app.deviceFor(a.address))} nft={a.nft?.image} size={36} round={a.kind === 'vault'} />
              <View style={{ flex: 1 }}>
                <Txt v="body" numberOfLines={1}>
                  {a.label}
                </Txt>
                <Txt v="small" numberOfLines={1}>
                  {a.hidden ? t('Oculta en Inicio · no suma') : a.excluded ? t('No suma al total') : v != null ? m.fiatRaw(v) : st ? `${m.xrp(st.balanceXrp)} XRP` : '…'}
                </Txt>
              </View>
              <Switch
                value={!a.excluded && !a.hidden}
                disabled={!!a.hidden}
                onValueChange={(on) => {
                  tap();
                  app.updateAccount(a.id, { excluded: on ? undefined : true });
                }}
                trackColor={{ true: C.greenDeep, false: C.line }}
                thumbColor={C.text}
                accessibilityLabel={t('Sumar {x} al patrimonio', { x: a.label })}
              />
            </View>
          );
        })}
        {main.length === 0 && <Txt v="small" style={{ paddingVertical: SP.md }}>Todavía no tienes cuentas de mainnet.</Txt>}
      </Card>
      {test.length > 0 && <Txt v="small">{t('Las cuentas de testnet ({n}) nunca suman: su XRP no tiene valor.', { n: test.length })}</Txt>}
    </Section>
  );
}
