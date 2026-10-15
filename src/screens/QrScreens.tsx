import React from 'react';
import { t } from '../i18n';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Notice, Screen, Txt, success, toast } from '../ui/components';
import { ScanView } from '../ui/ScanView';
import { C, R, SP } from '../ui/theme';
import { encodeProposalQr, isProposalQr, parseAddressQr } from '../core/qr';
import { describeTx } from '../core/tx';

export function ShowQrScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const p = app.proposals.find((x) => x.id === id);
  if (!p) return <Screen title="QR" onBack={nav.pop}><Txt v="body">No existe.</Txt></Screen>;
  const value = encodeProposalQr(p.network, p.tx, p.signatures);
  return (
    <Screen title="Compartir para firmar" onBack={nav.pop}>
      <View style={{ alignItems: 'center' }}>
        <Txt v="h2">{describeTx(p.tx, p.network).title}</Txt>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
          <Badge text={p.signatures.length === 1 ? t('1 firma incluida') : t('{n} firmas incluidas', { n: p.signatures.length })} />
          {p.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
        </View>
        <View style={{ backgroundColor: '#fff', padding: 16, borderRadius: R.lg, marginTop: SP.xl }}>
          <QRCode value={value} size={290} ecl="L" backgroundColor="#fff" color="#000" />
        </View>
      </View>
      <Txt v="small" style={{ marginTop: SP.xl, textAlign: 'center' }}>
        En el otro teléfono: Quorum → Escanear. Después de firmar, ese teléfono mostrará su propio QR: escanéalo desde aquí para sumar la firma.
      </Txt>
      <Notice kind="info">El QR contiene la operación y firmas públicas. Nunca contiene claves privadas.</Notice>
      <Button title="Escanear la firma de vuelta" icon="maximize" onPress={() => nav.replace('scan', { purpose: 'any' })} />
    </Screen>
  );
}

export function ScanScreen({ purpose }: { purpose: 'any' }) {
  const app = useApp();
  const nav = useNav();
  return (
    <ScanView
      title="Escanear"
      hint="Apunta a un QR de dirección o de una operación de Quorum"
      onClose={nav.pop}
      onScan={async (data) => {
        if (isProposalQr(data)) {
          const r = await app.importQr(data);
          success();
          toast(r.isNew ? 'Operación recibida' : r.added > 0 ? r.added > 1 ? t('{n} firmas agregadas', { n: r.added }) : t('1 firma agregada') : 'Sin firmas nuevas', r.added > 0 || r.isNew ? 'ok' : 'warn');
          nav.replace('proposal', { id: r.proposal.id });
          return;
        }
        const addr = parseAddressQr(data);
        if (addr) {
          success();
          // Escaneo general de una dirección: elegir desde qué cuenta enviar
          const from = app.accounts.find((a) => a.kind === 'wallet' && app.deviceFor(a.address)) ?? app.accounts[0];
          if (from) nav.replace('send', { id: from.id, to: addr.address, tag: addr.tag });
          else throw new Error('Agrega una cuenta para poder enviar');
          return;
        }
        throw new Error('QR no reconocido');
      }}
    />
  );
}
