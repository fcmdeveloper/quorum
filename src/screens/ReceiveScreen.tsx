import React from 'react';
import { Share, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Notice, Screen, Txt, toast } from '../ui/components';
import { C, R, SP, F } from '../ui/theme';

export default function ReceiveScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id)!;
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
          <QRCode value={a.address} size={230} backgroundColor="#fff" color="#000" />
        </View>
        <Txt v="mono" style={{ marginTop: SP.xl, textAlign: 'center', fontSize: 15, lineHeight: 22, fontFamily: F.monoMedium }} selectable>
          {a.address}
        </Txt>
      </View>
      <View style={{ flexDirection: 'row', gap: SP.md, marginTop: SP.xl }}>
        <Button
          title="Copiar"
          icon="copy"
          kind="secondary"
          style={{ flex: 1 }}
          onPress={async () => {
            await Clipboard.setStringAsync(a.address);
            toast('Dirección copiada');
          }}
        />
        <Button title="Compartir" icon="share" kind="secondary" style={{ flex: 1 }} onPress={() => Share.share({ message: a.address })} />
      </View>
      <Notice kind="info">
        Solo envía XRP o tokens del XRP Ledger{a.network === 'testnet' ? ' de testnet' : ''} a esta dirección. Desde un exchange no necesitas destination tag para tu propia cuenta.
      </Notice>
      {a.kind === 'vault' && <Notice kind="info">Esta es una bóveda: recibir es libre, pero cada salida requiere el quórum de firmas.</Notice>}
    </Screen>
  );
}
