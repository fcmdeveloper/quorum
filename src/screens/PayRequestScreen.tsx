/**
 * Pedido de pago recibido por enlace o QR: muestra qué se pide y deja elegir desde qué cuenta pagar
 * (como en Donar). Luego abre Enviar con todo rellenado, donde se revisa y se firma con sus avisos
 * de siempre (destino nuevo, direcciones parecidas, saldo).
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { t } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { Badge, Button, Card, ListItem, Notice, Row, Screen, Txt, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { lookalikeOf, trustedAddresses } from '../core/lookalike';
import type { PayRequest } from '../core/payRequest';
import { assetSymbol, knownToken } from '../core/assets';
import { formatFiat } from '../core/market';

export default function PayRequestScreen({ req }: { req: PayRequest }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();

  const own = app.accounts.find((x) => x.network === req.network && x.address === req.to);
  const known = app.contacts.find((c) => c.address === req.to) ?? own;
  const twin = known ? null : lookalikeOf(req.to, trustedAddresses(app));

  // Cuentas de la misma red que pueden firmar desde este teléfono (dispositivo propio o bóveda con firmantes).
  const sources = app.accounts.filter(
    (a) => a.network === req.network && a.address !== req.to && (app.deviceFor(a.address) || app.stateOf(a)?.signerList),
  );
  // XRP o el token pedido (p. ej. una stablecoin)
  const tokenAsset = req.currency && req.issuer ? { currency: req.currency, issuer: req.issuer } : null;
  const symbol = tokenAsset ? assetSymbol(tokenAsset, req.network) : 'XRP';
  const knownTok = tokenAsset ? knownToken(req.network, tokenAsset) : undefined;
  const need = req.amount ? Number(req.amount) : 0;
  /** Lo que la cuenta puede pagar en esa moneda (null: aún no se leyó la red). */
  const balanceOf = (id: string): number | null => {
    const st = app.stateOf(app.accounts.find((a) => a.id === id)!);
    if (!st) return null;
    if (!tokenAsset) return Number(st.spendableXrp);
    const tk = st.tokens.find((x) => x.currency === tokenAsset.currency && x.issuer === tokenAsset.issuer);
    return tk ? Number(tk.balance) : 0;
  };
  const enough = (id: string) => {
    const b = balanceOf(id);
    // con token hay que tenerlo (y que alcance); en XRP, si aún no se leyó, se deja elegir
    if (b === null) return !tokenAsset;
    return need ? b >= need : !tokenAsset || b > 0;
  };
  const [srcId, setSrcId] = useState(sources.find((s) => enough(s.id))?.id ?? sources[0]?.id);
  const src = sources.find((s) => s.id === srcId);

  const go = () => {
    if (!src) return;
    if (!enough(src.id) && tokenAsset) return;
    nav.replace('send', { id: src.id, to: req.to, tag: req.tag, amount: req.amount, asset: tokenAsset ? `${tokenAsset.currency}:${tokenAsset.issuer}` : undefined });
  };

  return (
    <Screen title="Pedido de pago" onBack={nav.pop}>
      <View style={{ alignItems: 'center', paddingVertical: SP.md }}>
        <Txt v="small" color={C.dim}>
          {req.from ? t('«{x}» te pide', { x: req.from }) : t('Te piden')}
        </Txt>
        <Txt v="hero" style={{ marginTop: 4 }}>
          {req.amount ? `${m.xrp(Number(req.amount))} ${symbol}` : t('Un pago')}
        </Txt>
        {req.amount && req.network === 'mainnet' ? (
          <Txt v="body" color={C.dim}>
            {tokenAsset ? m.tokenFiat(Number(req.amount), tokenAsset, req.network) : m.fiatOf(Number(req.amount), req.network)}
          </Txt>
        ) : null}
        {req.fiatValue && req.fiat && !tokenAsset ? (
          <Txt v="small" color={C.dim}>
            {t('Pedido como {v}; el monto en XRP quedó fijo al pedir.', { v: formatFiat(Number(req.fiatValue), req.fiat as any) })}
          </Txt>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>{req.network === 'testnet' && <Badge text="Testnet" color={C.test} />}</View>
      </View>

      <Card>
        <Row k="Para" v={known ? `${known.label} · ${req.to.slice(0, 6)}…${req.to.slice(-4)}` : req.to} mono={!known} />
        {tokenAsset ? <Row k="Token" v={`${symbol} · ${tokenAsset.issuer.slice(0, 6)}…${tokenAsset.issuer.slice(-4)}`} /> : null}
        {req.tag ? <Row k="Destination tag" v={req.tag} /> : null}
        {req.note ? <Row k="Motivo" v={req.note} /> : null}
      </Card>

      {tokenAsset && !knownTok ? (
        <Notice kind="bad">{t('Este token no es uno de los verificados en Quorum. Su emisor es {i}: confirma con quien te pide el pago que es el correcto.', { i: tokenAsset.issuer })}</Notice>
      ) : null}
      {twin ? (
        <Notice kind="bad">
          {t('Esta dirección se parece a «{l}», pero NO es la misma. Puede ser una estafa de direcciones parecidas: confirma con quien te pide el pago por otro medio.', { l: twin.label })}
        </Notice>
      ) : null}
      {req.from || req.note ? (
        <Notice kind="info">{t('El nombre y el motivo los escribió quien pide el pago y no están verificados. Lo que vale es la dirección: confírmala con esa persona si no la conoces.')}</Notice>
      ) : null}
      {own ? <Notice kind="info">{t('Es tu propia cuenta «{x}»: elige otra cuenta para pagar.', { x: own.label })}</Notice> : null}

      {sources.length === 0 ? (
        <>
          <Notice kind="info">
            {req.network === 'testnet'
              ? t('Para pagar desde Quorum, agrega una cuenta de testnet con su dispositivo.')
              : t('Para pagar desde Quorum, agrega una cuenta de mainnet con su dispositivo. También puedes copiar la dirección y pagar desde otra billetera.')}
          </Notice>
          <Button
            title="Copiar dirección"
            icon="copy"
            kind="secondary"
            onPress={async () => {
              await Clipboard.setStringAsync(req.to);
              toast('Dirección copiada');
            }}
          />
        </>
      ) : (
        <>
          <Txt v="label" style={{ marginTop: SP.md, marginBottom: 6 }}>
            Pagar desde
          </Txt>
          {sources.map((s) => {
            const bal = balanceOf(s.id);
            const short = !enough(s.id);
            const balText = bal === null ? '' : `${m.xrp(bal)} ${symbol}`;
            return (
              <Card key={s.id} onPress={() => setSrcId(s.id)} style={{ paddingVertical: 4, borderColor: s.id === srcId ? C.green : C.line }}>
                <ListItem
                  icon={s.kind === 'vault' ? 'lock' : 'credit-card'}
                  title={s.label}
                  subtitle={bal === null ? '' : tokenAsset && bal === 0 ? t('Sin {x}', { x: symbol }) : short ? t('{x} disponibles · no alcanza', { x: balText }) : t('{x} disponibles', { x: balText })}
                  right={s.id === srcId ? <Feather name="check-circle" size={20} color={C.green} /> : undefined}
                />
              </Card>
            );
          })}
          <Button title="Continuar" icon="arrow-right" disabled={!src || (!!tokenAsset && !enough(src.id))} onPress={go} />
          {tokenAsset && sources.every((s) => !enough(s.id)) ? (
            <Notice kind="info">{t('Ninguna de tus cuentas tiene {x} suficiente para este pago. Habilita {x} y recíbelo en una de tus cuentas, o pide que te cobren en XRP.', { x: symbol })}</Notice>
          ) : null}
          <Txt v="small" style={{ marginTop: SP.sm, textAlign: 'center' }}>
            {t('En el siguiente paso revisas el pago y lo firmas.')}
          </Txt>
        </>
      )}
    </Screen>
  );
}
