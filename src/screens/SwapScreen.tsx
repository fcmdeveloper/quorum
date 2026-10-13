import React, { useEffect, useMemo, useRef, useState } from 'react';
import { t, locale } from '../i18n';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { useMoney } from '../ui/money';
import { AmountInput, Button, Card, Notice, Row, Screen, Segmented, Txt, tap } from '../ui/components';
import { C, F, R, SP } from '../ui/theme';
import { Asset, KNOWN_TOKENS, XRP, assetSymbol, isXrp, sameAsset } from '../core/assets';
import { SwapQuote, quoteSwap } from '../core/dex';
import { buildSwap } from '../core/tx';

type Opt = { key: string; asset: Asset; label: string; enabled: boolean; balance: number };

export default function SwapScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id)!;
  const st = app.stateOf(a);

  const opts: Opt[] = useMemo(() => {
    const list: Opt[] = [{ key: 'XRP', asset: XRP, label: 'XRP', enabled: true, balance: Number(st?.spendableXrp ?? 0) }];
    for (const k of KNOWN_TOKENS[a.network]) {
      const line = st?.tokens.find((t) => t.currency === k.currency && t.issuer === k.issuer);
      list.push({ key: k.symbol, asset: { currency: k.currency, issuer: k.issuer }, label: k.symbol, enabled: !!line, balance: Number(line?.balance ?? 0) });
    }
    return list;
  }, [st, a.network]);

  const [fromKey, setFromKey] = useState('XRP');
  const [toKey, setToKey] = useState(KNOWN_TOKENS[a.network][0].symbol);
  const [amount, setAmount] = useState('');
  const [slip, setSlip] = useState('1');
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [qErr, setQErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reqId = useRef(0);

  const from = opts.find((o) => o.key === fromKey)!;
  const to = opts.find((o) => o.key === toKey)!;
  const amt = Number(amount.replace(',', '.'));

  useEffect(() => {
    setQuote(null);
    setQErr(null);
    if (!(amt > 0) || sameAsset(from.asset, to.asset)) return;
    const my = ++reqId.current;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const q = await quoteSwap(a.network, from.asset, to.asset, amt);
        if (my !== reqId.current) return;
        if (!q) setQErr('No hay liquidez suficiente para este monto');
        setQuote(q);
      } catch (e: any) {
        if (my === reqId.current) setQErr(e?.message ?? 'Sin cotización');
      } finally {
        if (my === reqId.current) setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [amt, fromKey, toKey]);

  const minOut = quote ? quote.out * (1 - Number(slip) / 100) : 0;
  const over = amt > from.balance;

  const flip = () => {
    tap();
    setFromKey(toKey);
    setToKey(fromKey);
    setAmount('');
  };

  const go = async () => {
    if (!quote) return;
    setBusy(true);
    try {
      const tx = buildSwap(a.address, from.asset, amt, to.asset, minOut);
      const p = await app.createProposal(a, tx);
      nav.replace('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setBusy(false);
    }
  };

  const AssetPicker = ({ value, onPick, exclude }: { value: string; onPick: (k: string) => void; exclude: string }) => (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {opts
        .filter((o) => o.key !== exclude)
        .map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              onPress={() => {
                tap();
                onPick(o.key);
              }}
              style={{
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: R.pill,
                backgroundColor: on ? C.green : C.raised,
                opacity: o.enabled ? 1 : 0.5,
              }}
            >
              <Text style={{ fontFamily: F.semibold, color: on ? C.greenInk : C.text }}>{t(o.label)}</Text>
            </Pressable>
          );
        })}
    </View>
  );

  return (
    <Screen title={`Swap · ${a.label}`} onBack={nav.pop}>
      <Card>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SP.sm }}>
          <Txt v="label">Entregas</Txt>
          <Txt v="label">
            Disponible {m.xrp(from.balance)} {from.label}
          </Txt>
        </View>
        <AssetPicker value={fromKey} onPick={(k) => (k === toKey ? flip() : setFromKey(k))} exclude="" />
        <View style={{ marginTop: SP.md, marginHorizontal: -SP.lg, marginBottom: -SP.lg }}>
          <AmountInput
            value={amount}
            onChange={setAmount}
            unit={from.label}
            error={over}
            sub={amt > 0 ? m.tokenFiat(amt, from.asset, a.network) || (isXrp(from.asset) ? m.fiatOf(amt, a.network) : undefined) : undefined}
            onPercent={(pct) => {
              const margin = isXrp(from.asset) ? (a.kind === 'vault' ? 0.01 : 0.001) : 0;
              const v = pct === 100 ? Math.max(0, from.balance - margin) : (from.balance * pct) / 100;
              setAmount(v > 0 ? (Math.floor(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '') : '');
            }}
          />
        </View>
      </Card>

      <View style={{ alignItems: 'center', marginVertical: -SP.lg, zIndex: 2 }}>
        <Pressable onPress={flip} style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.lineStrong, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel="Invertir">
          <Feather name="arrow-down" size={20} color={C.green} />
        </Pressable>
      </View>

      <Card>
        <Txt v="label" style={{ marginBottom: SP.sm }}>
          Recibes
        </Txt>
        <AssetPicker value={toKey} onPick={(k) => (k === fromKey ? flip() : setToKey(k))} exclude="" />
        <Text style={{ fontFamily: F.bold, fontSize: 32, color: quote ? C.text : C.faint, marginTop: SP.md }}>
          {quoting ? '…' : quote ? `≈ ${m.xrp(quote.out)}` : '0'}
        </Text>
        {quote && to.asset && m.tokenFiat(quote.out, to.asset, a.network) ? <Txt v="small">{m.tokenFiat(quote.out, to.asset, a.network)}</Txt> : null}
      </Card>

      {!to.enabled && (
        <Notice>
          Para recibir {to.label} primero habilítalo en esta cuenta (Activos → Habilitar).
        </Notice>
      )}
      {qErr && <Notice kind="bad">{qErr}</Notice>}
      {over && <Notice kind="bad">El monto supera tu saldo disponible.</Notice>}

      {quote && (
        <Card>
          <Row k="Precio" v={`1 ${from.label} ≈ ${quote.rate.toLocaleString(locale(), { maximumFractionDigits: 6 })} ${to.label}`} />
          <Row k="Mínimo garantizado" v={`${m.xrp(minOut)} ${to.label}`} />
          <Row k="Impacto en el precio" v={`${(quote.priceImpact * 100).toFixed(2)} %`} />
          <Row k="Liquidez" v={quote.source === 'amm' ? 'Pool AMM' : 'Libro de órdenes'} />
          <Txt v="label" style={{ marginTop: SP.md, marginBottom: 6 }}>
            Tolerancia de precio
          </Txt>
          <Segmented
            value={slip}
            onChange={setSlip}
            options={[
              { value: '0.5', label: '0,5 %' },
              { value: '1', label: '1 %' },
              { value: '2', label: '2 %' },
              { value: '5', label: '5 %' },
            ]}
          />
          <Txt v="small">
            Se ejecuta completo o no se ejecuta: nunca recibes menos del mínimo.{a.kind === 'vault' ? ' En una bóveda, junta las firmas rápido: si el precio se mueve más que la tolerancia, el swap se rechaza sin perder fondos.' : ''}
          </Txt>
        </Card>
      )}
      {quote && quote.priceImpact > 0.03 && <Notice>Impacto alto: estás moviendo el precio más de un 3 %. Considera un monto menor.</Notice>}

      <Button
        title={`Swap ${from.label} → ${to.label}`}
        icon="repeat"
        busy={busy}
        disabled={!quote || over || !to.enabled || !from.enabled}
        onPress={go}
      />
    </Screen>
  );
}
