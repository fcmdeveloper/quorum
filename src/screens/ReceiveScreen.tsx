import React, { useEffect, useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { Badge, Button, Card, Field, Notice, Screen, Segmented, Txt, toast } from '../ui/components';
import { C, R, SP, F } from '../ui/theme';
import { t } from '../i18n';
import { QUORUM } from '../config';
import { MAX_FROM, MAX_NOTE } from '../core/share';
import { normalizeXrpAmount, payLink, payMessage, PayRequest } from '../core/payRequest';
import { KNOWN_TOKENS } from '../core/assets';
import { FIATS, formatFiat } from '../core/market';

export default function ReceiveScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id)!;
  // Pedir un monto: el QR y lo que se comparte pasan a ser un pedido de pago (enlace de Quorum).
  const [asking, setAsking] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  // Qué se pide: XRP o una stablecoin conocida que esta cuenta ya tiene habilitada.
  const st = app.stateOf(a);
  const stables = KNOWN_TOKENS[a.network].filter((k) => st?.tokens.some((tk) => tk.currency === k.currency && tk.issuer === k.issuer));
  const [assetKey, setAssetKey] = useState('XRP');
  const token = stables.find((k) => `${k.currency}:${k.issuer}` === assetKey) ?? null;
  const symbol = token?.symbol ?? 'XRP';
  // En XRP se puede escribir el monto en la divisa elegida: se convierte al precio de ahora.
  const fiatOk = !token && a.network === 'mainnet' && !!m.price;
  const [unit, setUnit] = useState<'xrp' | 'fiat'>('xrp');
  const inFiat = fiatOk && unit === 'fiat';
  const fiatLabel = FIATS.find((f) => f.value === m.fiat)?.label ?? 'USD';
  // El precio se congela al empezar a pedir en divisa: así el QR no cambia solo cada minuto
  // (lo que se ve es exactamente lo que se cobra). "Actualizar precio" lo vuelve a tomar.
  const [lockedPrice, setLockedPrice] = useState<number | null>(null);
  useEffect(() => {
    if (inFiat && lockedPrice === null && m.price) setLockedPrice(m.price);
    if (!inFiat && lockedPrice !== null) setLockedPrice(null);
  }, [inFiat, m.price]);
  const typed = normalizeXrpAmount(amountText);
  let amount: string | null = typed;
  if (typed && inFiat) {
    amount = lockedPrice ? normalizeXrpAmount((Math.floor((Number(typed) / lockedPrice) * 1e6) / 1e6).toFixed(6)) : null;
  }
  const priceMoved = inFiat && lockedPrice && m.price ? Math.abs(m.price / lockedPrice - 1) >= 0.001 : false;
  const badAmount = !!amountText && !amount;
  const req: PayRequest | null =
    asking && amount
      ? {
          to: a.address,
          network: a.network,
          amount,
          currency: token?.currency,
          issuer: token?.issuer,
          fiatValue: inFiat ? typed! : undefined,
          fiat: inFiat ? m.fiat : undefined,
          note: note || undefined,
          from: app.settings.shareName,
        }
      : null;
  const link = req ? payLink(QUORUM.website, req) : null;

  const copy = async () => {
    await Clipboard.setStringAsync(link ?? a.address);
    toast(link ? 'Enlace copiado' : 'Dirección copiada');
  };
  const share = () => Share.share({ message: req && link ? payMessage(req, link, t, symbol) : a.address });

  return (
    <Screen title="Recibir" onBack={nav.pop}>
      <View style={{ alignItems: 'center', marginTop: SP.lg }}>
        <Txt v="h2">{a.label}</Txt>
        {a.network === 'testnet' && (
          <View style={{ marginTop: 6 }}>
            <Badge text="Testnet" color={C.test} />
          </View>
        )}
        <View style={{ backgroundColor: '#fff', padding: 18, borderRadius: R.lg, marginTop: SP.xl }}>
          <QRCode value={link ?? a.address} size={230} backgroundColor="#fff" color="#000" />
        </View>
        {req ? (
          <View style={{ alignItems: 'center', marginTop: SP.lg }}>
            <Txt v="h2">{t('Pides {x} {s}', { x: m.xrp(Number(req.amount)), s: symbol })}</Txt>
            {req.fiatValue ? (
              <Txt v="small" color={C.dim}>
                {t('≈ {v} al precio tomado al pedir', { v: formatFiat(Number(req.fiatValue), m.fiat) })}
              </Txt>
            ) : null}
            {req.note ? (
              <Txt v="small" color={C.dim}>
                {req.note}
              </Txt>
            ) : null}
          </View>
        ) : null}
        <Txt v="mono" style={{ marginTop: SP.lg, textAlign: 'center', fontSize: 15, lineHeight: 22, fontFamily: F.monoMedium }} selectable>
          {a.address}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: SP.md, marginTop: SP.xl }}>
        <Button title={link ? 'Copiar enlace' : 'Copiar'} icon="copy" kind="secondary" style={{ flex: 1 }} onPress={copy} />
        <Button title={link ? 'Compartir pedido' : 'Compartir'} icon="share" kind="secondary" style={{ flex: 1 }} onPress={share} />
      </View>

      {!asking ? (
        <Button title="Pedir un monto" icon="dollar-sign" kind="ghost" onPress={() => setAsking(true)} />
      ) : (
        <Card style={{ marginTop: SP.md }}>
          <Txt v="h3">Pedir un monto</Txt>
          <Txt v="small" style={{ marginTop: 4, marginBottom: SP.sm }}>
            {t('Quien lo abra en Quorum solo elige desde qué cuenta pagar y firma. Si no tiene Quorum, el enlace le muestra la dirección y el monto para pagar desde cualquier billetera.')}
          </Txt>
          {stables.length > 0 ? (
            <>
              <Txt v="label" style={{ marginBottom: 6 }}>
                Moneda
              </Txt>
              <Segmented
                value={assetKey}
                onChange={(v) => {
                  setAssetKey(v);
                  setUnit('xrp');
                }}
                options={[{ value: 'XRP', label: 'XRP' }, ...stables.map((k) => ({ value: `${k.currency}:${k.issuer}`, label: k.symbol }))]}
              />
            </>
          ) : null}
          {fiatOk ? (
            <Segmented
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'xrp', label: t('En XRP') },
                { value: 'fiat', label: t('En {x}', { x: fiatLabel }) },
              ]}
            />
          ) : null}
          <Field
            label={inFiat ? t('Monto ({x})', { x: fiatLabel }) : t('Monto ({x})', { x: symbol })}
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="Ej. 25"
            error={badAmount ? t('Monto inválido (hasta 6 decimales)') : undefined}
            hint={
              amount
                ? inFiat
                  ? t('= {x} XRP con 1 XRP = {p}. Ese monto en XRP queda fijo en el pedido.', { x: m.xrp(Number(amount)), p: formatFiat(lockedPrice ?? 0, m.fiat) })
                  : token
                    ? m.tokenFiat(Number(amount), { currency: token.currency, issuer: token.issuer }, a.network) || undefined
                    : a.network === 'mainnet'
                      ? m.fiatOf(Number(amount), a.network)
                      : undefined
                : undefined
            }
          />
          {inFiat ? (
            <Button
              title={priceMoved ? t('Actualizar precio (ahora {p})', { p: formatFiat(m.price ?? 0, m.fiat) }) : t('Actualizar precio')}
              kind="ghost"
              icon="refresh-cw"
              disabled={!priceMoved}
              onPress={() => setLockedPrice(m.price ?? null)}
              style={{ marginBottom: SP.lg }}
            />
          ) : null}
          <Field label="Motivo (opcional)" value={note} onChangeText={(v) => setNote(v.slice(0, MAX_NOTE))} placeholder={t('Almuerzo del viernes')} autoCapitalize="sentences" />
          <Field
            label="Tu nombre (opcional)"
            value={app.settings.shareName ?? ''}
            onChangeText={(v) => app.updateSettings({ shareName: v.slice(0, MAX_FROM) })}
            placeholder="Alex"
            autoCapitalize="words"
           
          />
          <Button
            title="Quitar el monto"
            kind="ghost"
            onPress={() => {
              setAsking(false);
              setAmountText('');
              setNote('');
            }}
          />
        </Card>
      )}

      <Notice kind="info">
        {a.network === 'testnet'
          ? t('Solo envía XRP o tokens del XRP Ledger de testnet a esta dirección. Desde un exchange no necesitas destination tag para tu propia cuenta.')
          : t('Solo envía XRP o tokens del XRP Ledger a esta dirección. Desde un exchange no necesitas destination tag para tu propia cuenta.')}
      </Notice>
      {req ? <Notice kind="info">{t('El enlace no pasa por ningún servidor: los datos van después del “#”. El nombre y el motivo se muestran como no verificados.')}</Notice> : null}
      {a.kind === 'vault' && <Notice kind="info">Esta es una bóveda: recibir es libre, pero cada salida requiere el quórum de firmas.</Notice>}
    </Screen>
  );
}
