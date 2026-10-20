import React, { useState } from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { Badge, Button, Card, Field, Notice, Screen, Txt, toast } from '../ui/components';
import { C, R, SP, F } from '../ui/theme';
import { t } from '../i18n';
import { QUORUM } from '../config';
import { MAX_FROM, MAX_NOTE } from '../core/share';
import { normalizeXrpAmount, payLink, payMessage, PayRequest } from '../core/payRequest';

export default function ReceiveScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id)!;
  // Pedir un monto: el QR y lo que se comparte pasan a ser un pedido de pago (enlace de Quorum).
  const [asking, setAsking] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const amount = normalizeXrpAmount(amountText);
  const badAmount = !!amountText && !amount;
  const req: PayRequest | null = asking && amount ? { to: a.address, network: a.network, amount, note: note || undefined, from: app.settings.shareName } : null;
  const link = req ? payLink(QUORUM.website, req) : null;

  const copy = async () => {
    await Clipboard.setStringAsync(link ?? a.address);
    toast(link ? 'Enlace copiado' : 'Dirección copiada');
  };
  const share = () => Share.share({ message: req && link ? payMessage(req, link, t) : a.address });

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
            <Txt v="h2">{t('Pides {x} XRP', { x: m.xrp(Number(req.amount)) })}</Txt>
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
          <Field
            label="Monto (XRP)"
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="decimal-pad"
            placeholder="Ej. 25"
            error={badAmount ? t('Monto inválido (hasta 6 decimales)') : undefined}
            hint={amount && a.network === 'mainnet' ? m.fiatOf(Number(amount), a.network) : undefined}
          />
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
