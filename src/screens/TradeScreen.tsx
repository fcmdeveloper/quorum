import React, { useCallback, useEffect, useState } from 'react';
import { t, locale } from '../i18n';
import { Alert, Pressable, Text, View } from 'react-native';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { useMoney } from '../ui/money';
import { Badge, Button, Card, Empty, Field, ListItem, Notice, Screen, Section, Segmented, Txt, tap } from '../ui/components';
import { C, F, R, SP } from '../ui/theme';
import { Asset, KNOWN_TOKENS, XRP, assetSymbol, isXrp, sameAsset } from '../core/assets';
import { BookLevel, OpenOffer, fetchOpenOffers, fetchOrderBook } from '../core/dex';
import { buildLimitOrder, buildOfferCancel } from '../core/tx';

export default function TradeScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id)!;
  const st = app.stateOf(a);
  const tokens = KNOWN_TOKENS[a.network];
  const [quoteKey, setQuoteKey] = useState(tokens[0].symbol);
  const quoteTok = tokens.find((t) => t.symbol === quoteKey)!;
  const base: Asset = XRP;
  const quote: Asset = { currency: quoteTok.currency, issuer: quoteTok.issuer };

  const [book, setBook] = useState<{ asks: BookLevel[]; bids: BookLevel[] } | null>(null);
  const [offers, setOffers] = useState<OpenOffer[] | null>(null);
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [b, o] = await Promise.all([fetchOrderBook(a.network, base, quote, 7), fetchOpenOffers(a.network, a.address)]);
      setBook(b);
      setOffers(o);
    } catch (e: any) {
      setErr(e?.message ?? 'Sin conexión');
    }
  }, [a.network, a.address, quoteKey]);

  useEffect(() => {
    setBook(null);
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  const hasQuoteLine = !!st?.tokens.find((t) => t.currency === quote.currency && t.issuer === (quote as any).issuer);
  const quoteBal = Number(st?.tokens.find((t) => t.currency === quote.currency && t.issuer === (quote as any).issuer)?.balance ?? 0);
  const amt = Number(amount.replace(',', '.'));
  const pr = Number(price.replace(',', '.'));
  const total = amt > 0 && pr > 0 ? amt * pr : 0;
  const bestAsk = book?.asks[0]?.price;
  const bestBid = book?.bids[0]?.price;
  const over = side === 'sell' ? amt > Number(st?.spendableXrp ?? 0) : total > quoteBal;
  const crosses = side === 'buy' ? bestAsk && pr >= bestAsk : bestBid && pr <= bestBid;

  const place = async () => {
    setBusy(true);
    try {
      const tx = buildLimitOrder(a.address, side, base, quote, amt, pr);
      const p = await app.createProposal(a, tx);
      nav.push('proposal', { id: p.id });
      setAmount('');
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setBusy(false);
    }
  };

  const cancel = (o: OpenOffer) =>
    Alert.alert('Cancelar orden', t('Orden #{n}', { n: o.seq }), [
      { text: 'Volver', style: 'cancel' },
      {
        text: 'Cancelar orden',
        style: 'destructive',
        onPress: async () => {
          try {
            const p = await app.createProposal(a, buildOfferCancel(a.address, o.seq));
            nav.push('proposal', { id: p.id });
          } catch (e: any) {
            proposalFailed('No se pudo', e, nav);
          }
        },
      },
    ]);

  const fmt = (n: number, d = 4) => n.toLocaleString(locale(), { maximumFractionDigits: d, minimumFractionDigits: Math.min(2, d) });

  const Level = ({ l, kind }: { l: BookLevel; kind: 'ask' | 'bid' }) => (
    <Pressable
      onPress={() => {
        tap();
        setPrice(String(Number(l.price.toPrecision(8))));
      }}
      style={{ flexDirection: 'row', paddingVertical: 5 }}
    >
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: kind === 'ask' ? C.bad : C.green }}>{fmt(l.price, 5)}</Text>
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: C.text, textAlign: 'right' }}>{fmt(l.amount, 2)}</Text>
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 13, color: C.dim, textAlign: 'right' }}>{fmt(l.total, 2)}</Text>
    </Pressable>
  );

  return (
    <Screen title={`DEX · ${a.label}`} onBack={nav.pop} onRefresh={load} refreshing={false}>
      <Segmented value={quoteKey} onChange={setQuoteKey} options={tokens.map((t) => ({ value: t.symbol, label: `XRP / ${t.symbol}` }))} />

      <Card>
        <View style={{ flexDirection: 'row', marginBottom: 6 }}>
          <Txt v="small" style={{ flex: 1 }}>
            Precio ({quoteTok.symbol})
          </Txt>
          <Txt v="small" style={{ flex: 1, textAlign: 'right' }}>
            XRP
          </Txt>
          <Txt v="small" style={{ flex: 1, textAlign: 'right' }}>
            Total
          </Txt>
        </View>
        {book === null ? (
          <Txt v="small">{err ?? 'Cargando libro…'}</Txt>
        ) : (
          <>
            {[...book.asks].reverse().map((l, i) => (
              <Level key={'a' + i} l={l} kind="ask" />
            ))}
            <View style={{ borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.line, paddingVertical: 8, marginVertical: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
              <Txt v="h3">{bestAsk && bestBid ? fmt((bestAsk + bestBid) / 2, 5) : '—'}</Txt>
              <Txt v="small">{bestAsk && bestBid ? `spread ${(((bestAsk - bestBid) / bestAsk) * 100).toFixed(2)} %` : 'sin liquidez'}</Txt>
            </View>
            {book.bids.map((l, i) => (
              <Level key={'b' + i} l={l} kind="bid" />
            ))}
            <Txt v="small" style={{ marginTop: 6 }}>
              Toca un nivel para usar su precio. Solo libro de órdenes; los pools AMM se usan en Swap.
            </Txt>
          </>
        )}
      </Card>

      <Card>
        <Segmented
          value={side}
          onChange={setSide}
          options={[
            { value: 'buy', label: 'Comprar XRP' },
            { value: 'sell', label: 'Vender XRP' },
          ]}
        />
        <Field label="Cantidad (XRP)" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" />
        <Field
          label={t('Precio por XRP ({x})', { x: quoteTok.symbol })}
          value={price}
          onChangeText={setPrice}
          keyboardType="decimal-pad"
          placeholder={bestBid ? fmt(side === 'buy' ? bestBid : bestAsk ?? bestBid, 5) : '0'}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Txt v="small">Total</Txt>
          <Txt v="body">
            {total ? `${fmt(total, 4)} ${quoteTok.symbol}` : '—'}
          </Txt>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Txt v="small">Disponible</Txt>
          <Txt v="small">{side === 'sell' ? `${m.xrp(st?.spendableXrp ?? 0)} XRP` : `${fmt(quoteBal, 4)} ${quoteTok.symbol}`}</Txt>
        </View>
        {!hasQuoteLine && <Notice>Habilita {quoteTok.symbol} en esta cuenta para operar este par.</Notice>}
        {crosses ? <Notice kind="info">Este precio cruza el libro: se ejecutará de inmediato (total o parcialmente) y el resto quedará como orden.</Notice> : null}
        {over && amt > 0 && <Notice kind="bad">No tienes saldo suficiente.</Notice>}
        <Button
          title={side === 'buy' ? 'Crear orden de compra' : 'Crear orden de venta'}
          busy={busy}
          disabled={!(amt > 0 && pr > 0) || over || !hasQuoteLine}
          onPress={place}
        />
        <Txt v="small" style={{ marginTop: 6 }}>
          Cada orden abierta reserva 0,2 XRP hasta que se ejecute o se cancele.
        </Txt>
      </Card>

      <Section title="Órdenes abiertas">
        {offers === null ? (
          <Txt v="small">Cargando…</Txt>
        ) : offers.length === 0 ? (
          <Empty icon="bar-chart-2" title="Sin órdenes abiertas" />
        ) : (
          offers.map((o) => {
            const sell = isXrp(o.gets.asset);
            const xrpAmt = sell ? o.gets.amount : o.pays.amount;
            const other = sell ? o.pays : o.gets;
            const p = other.amount / xrpAmt;
            return (
              <Card key={o.seq} style={{ paddingVertical: 4 }}>
                <ListItem
                  icon={sell ? 'arrow-up-right' : 'arrow-down-left'}
                  iconColor={sell ? C.bad : C.green}
                  title={sell ? t('Vender {x} XRP', { x: fmt(xrpAmt, 2) }) : t('Comprar {x} XRP', { x: fmt(xrpAmt, 2) })}
                  subtitle={`a ${fmt(p, 5)} ${assetSymbol(other.asset, a.network)} · #${o.seq}`}
                  right={
                    <Pressable hitSlop={8} onPress={() => cancel(o)}>
                      <Txt v="label" color={C.bad}>
                        Cancelar
                      </Txt>
                    </Pressable>
                  }
                />
              </Card>
            );
          })
        )}
      </Section>
    </Screen>
  );
}
