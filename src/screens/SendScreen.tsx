import React, { useMemo, useState } from 'react';
import { t } from '../i18n';
import { Alert, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { isValidClassicAddress } from 'ripple-address-codec';
import { lookalikeOf, trustedAddresses } from '../core/lookalike';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useAddressScanner } from '../ui/ScanView';
import { proposalFailed } from '../ui/proposalError';
import { useMoney } from '../ui/money';
import { AmountInput, Badge, Button, Card, Field, ListItem, Notice, Screen, Segmented, Txt, warnBuzz } from '../ui/components';
import { C, F, SP } from '../ui/theme';
import { buildAssetPayment } from '../core/tx';
import { Asset, XRP, assetSymbol } from '../core/assets';
import { fetchTransferRate } from '../core/dex';
import { FIATS, fiatToXrp, formatFiat } from '../core/market';

const KNOWN_EXCHANGE_HINT = 'Si envías a un exchange, el destination tag es obligatorio.';

export default function SendScreen({ id, to, tag: tag0, asset: asset0 }: { id: string; to?: string; tag?: string; asset?: string }) {
  const app = useApp();
  const nav = useNav();
  const scanner = useAddressScanner();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id)!;
  const st = app.stateOf(a);
  const [dest, setDest] = useState(to ?? '');
  const [tag, setTag] = useState(tag0 ?? '');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<'xrp' | 'fiat'>('xrp');
  const [memo, setMemo] = useState('');
  const [busy, setBusy] = useState(false);
  const [pickContact, setPickContact] = useState(false);
  const [assetKey, setAssetKey] = useState(asset0 ?? 'XRP');

  const tokenOpts = (st?.tokens ?? []).filter((t) => Number(t.balance) > 0);
  const token = assetKey === 'XRP' ? null : tokenOpts.find((t) => `${t.currency}:${t.issuer}` === assetKey) ?? null;
  const asset: Asset = token ? { currency: token.currency, issuer: token.issuer } : XRP;
  const sym = assetSymbol(asset, a.network);

  const fiatLabel = FIATS.find((f) => f.value === m.fiat)!.label;
  const fiatDisabled = a.network === 'testnet' || !m.price || !!token;

  const xrpAmount = useMemo(() => {
    const n = Number(amount.replace(',', '.'));
    if (!amount || !Number.isFinite(n) || n <= 0) return null;
    if (unit === 'xrp') return amount.replace(',', '.');
    try {
      return fiatToXrp(n, m.fiat, { price: { [m.fiat]: m.price } as any, change24h: {} as any, at: 0 });
    } catch {
      return null;
    }
  }, [amount, unit, m.price, m.fiat]);

  const destOk = isValidClassicAddress(dest.trim()) && dest.trim() !== a.address;
  const known =
    app.contacts.find((c) => c.address === dest.trim()) ?? app.accounts.find((x) => x.address === dest.trim() && x.network === a.network);
  // ¿se parece a una dirección de confianza sin serlo? (estafa de direcciones parecidas)
  const twin = destOk ? lookalikeOf(dest.trim(), trustedAddresses(app)) : null;
  const allowed = a.kind !== 'vault' || !!app.accounts.find((x) => x.address === dest.trim()) || (a.allowed ?? []).includes(dest.trim());
  const available = token ? Number(token.balance) : Number(st?.spendableXrp ?? 0);
  const over = xrpAmount && st ? Number(xrpAmount) > available : false;

  const review = async () => {
    if (!xrpAmount) return;
    let tx;
    try {
      const rate = token ? await fetchTransferRate(a.network, token.issuer) : 1;
      tx = buildAssetPayment(a.address, dest.trim(), asset, xrpAmount, { tag, memo, transferRate: rate });
    } catch (e: any) {
      return Alert.alert('Revisa los datos', e.message);
    }
    const go = async () => {
      setBusy(true);
      try {
        const p = await app.createProposal(a, tx);
        nav.replace('proposal', { id: p.id });
      } catch (e: any) {
        proposalFailed('No se pudo preparar', e, nav);
      } finally {
        setBusy(false);
      }
    };
    const confirmNew = () => {
      warnBuzz();
      Alert.alert(
        'Destino nuevo para esta bóveda',
        `${dest.trim()}\n\n${t('No es una de tus cuentas ni un destino permitido. Verifica la dirección carácter por carácter antes de continuar.')}`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Es correcta, continuar', style: 'destructive', onPress: go },
        ],
      );
    };
    if (twin) {
      warnBuzz();
      return Alert.alert(
        'Dirección parecida, no igual',
        t('Este destino se parece a «{l}», pero NO es la misma dirección:\n\nDestino:\n{d}\n\n«{l}»:\n{k}\n\nAsí funciona una estafa común: te envían montos mínimos desde una dirección parecida para que la copies por error desde tu actividad.', {
          l: twin.label,
          d: dest.trim(),
          k: twin.address,
        }),
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: t('Usar «{l}»', { l: twin.label }), onPress: () => setDest(twin.address) },
          { text: 'Sé que es otra, continuar', style: 'destructive', onPress: () => (allowed ? go() : confirmNew()) },
        ],
      );
    }
    if (!allowed) return confirmNew();
    go();
  };
  return (
    <Screen title={t('Enviar desde {x}', { x: a.label })} onBack={nav.pop}>
      <Field
        label="Destino"
        placeholder="Dirección r…"
        value={dest}
        onChangeText={setDest}
        error={dest && !isValidClassicAddress(dest.trim()) ? 'Dirección XRPL inválida' : undefined}
        hint={known ? `✓ ${known.label}` : undefined}
        right={
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Pressable hitSlop={8} style={{ padding: 6 }} onPress={() => setPickContact((v) => !v)} accessibilityLabel="Contactos">
              <Feather name="book" size={18} color={C.dim} />
            </Pressable>
            <Pressable
              hitSlop={8}
              style={{ padding: 6 }}
              accessibilityLabel="Escanear"
              onPress={() =>
                scanner.open((addr: string, t?: string) => {
                  setDest(addr);
                  if (t) setTag(t);
                })
              }
            >
              <Feather name="maximize" size={18} color={C.green} />
            </Pressable>
            {scanner.modal}
          </View>
        }
      />

      {pickContact && (
        <Card style={{ marginTop: -SP.sm, paddingVertical: 4 }}>
          {[...app.accounts.filter((x) => x.network === a.network && x.id !== a.id).map((x) => ({ id: x.id, label: x.label, address: x.address, tag: undefined as string | undefined, mine: true })), ...app.contacts.map((c) => ({ ...c, mine: false }))].map((c) => (
            <ListItem
              key={c.id}
              icon={c.mine ? 'user-check' : 'user'}
              title={c.label}
              subtitle={`${c.address.slice(0, 8)}…${c.address.slice(-6)}`}
              onPress={() => {
                setDest(c.address);
                if (c.tag) setTag(c.tag);
                setPickContact(false);
              }}
            />
          ))}
          {app.contacts.length === 0 && app.accounts.length < 2 ? <Txt v="small" style={{ padding: SP.md }}>Agrega contactos en Ajustes.</Txt> : null}
        </Card>
      )}

      {twin && (
        <Notice kind="bad">
          {t('Cuidado: se parece a «{l}» ({k}), pero no es la misma dirección. Revísala completa.', { l: twin.label, k: `${twin.address.slice(0, 6)}…${twin.address.slice(-6)}` })}
        </Notice>
      )}
      <Field label="Destination tag (opcional)" keyboardType="number-pad" value={tag} onChangeText={setTag} hint={KNOWN_EXCHANGE_HINT} />

      {tokenOpts.length > 0 && (
        <>
          <Txt v="label" style={{ marginBottom: 6 }}>
            Activo
          </Txt>
          <Segmented
            value={assetKey}
            onChange={(k) => {
              setAssetKey(k);
              setUnit('xrp');
              setAmount('');
            }}
            options={[
              { value: 'XRP', label: 'XRP' },
              ...tokenOpts.slice(0, 3).map((t) => ({ value: `${t.currency}:${t.issuer}`, label: assetSymbol({ currency: t.currency, issuer: t.issuer }, a.network) })),
            ]}
          />
        </>
      )}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Txt v="label">Monto</Txt>
        {st ? (
          <Txt v="label">
            Disponible {m.xrp(available)} {sym}
          </Txt>
        ) : null}
      </View>
      {!fiatDisabled && (
        <Segmented
          value={unit}
          onChange={(u) => {
            setUnit(u);
            setAmount('');
          }}
          options={[
            { value: 'xrp', label: sym },
            { value: 'fiat', label: fiatLabel },
          ]}
        />
      )}
      <AmountInput
        value={amount}
        onChange={setAmount}
        unit={unit === 'xrp' ? sym : fiatLabel}
        error={!!over}
        sub={
          unit === 'xrp'
            ? token
              ? (xrpAmount && m.tokenFiat(Number(xrpAmount), asset, a.network)) || undefined
              : xrpAmount && m.price && a.network === 'mainnet'
                ? `≈ ${formatFiat(Number(xrpAmount) * m.price, m.fiat)}`
                : undefined
            : xrpAmount
              ? `= ${xrpAmount} XRP`
              : undefined
        }
        onPercent={(pct) => {
          // Para XRP se deja un margen mínimo para la comisión (la de multifirma es mayor)
          const margin = token ? 0 : a.kind === 'vault' ? 0.01 : 0.001;
          const v = pct === 100 ? Math.max(0, available - margin) : (available * pct) / 100;
          setUnit('xrp');
          setAmount(v > 0 ? (Math.floor(v * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '') : '');
        }}
      />
      {unit === 'fiat' && <Txt v="small">El monto en {fiatLabel} se convierte a XRP con el precio actual. Lo que se envía y firma siempre es XRP.</Txt>}

      <Field label="Memo (opcional)" value={memo} onChangeText={setMemo} placeholder="Visible públicamente en el ledger" />

      {over && <Notice kind="bad">{token ? 'El monto supera tu saldo de este token.' : 'El monto supera lo disponible (la reserva de la cuenta no se puede enviar).'}</Notice>}
      {token && <Notice kind="info">El destino debe tener {sym} habilitado; si no, el envío fallará sin costo más allá de la comisión.</Notice>}
      {a.kind === 'vault' && destOk && !allowed && <Notice>Este destino no está entre tus cuentas ni destinos permitidos.</Notice>}
      {a.network === 'testnet' && <Badge text="Testnet: XRP sin valor" color={C.test} />}

      <Button title="Revisar envío" onPress={review} busy={busy} disabled={!destOk || !xrpAmount || !!over} style={{ marginTop: SP.lg }} />
    </Screen>
  );
}
