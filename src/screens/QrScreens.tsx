import React, { useRef, useState } from 'react';
import { t } from '../i18n';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Empty, Notice, Screen, Txt, success, toast, warnBuzz } from '../ui/components';
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

export function ScanScreen({ purpose, onAddress }: { purpose: 'any' | 'address'; onAddress?: (a: string, tag?: string) => void }) {
  const app = useApp();
  const nav = useNav();
  const [perm, request] = useCameraPermissions();
  const [err, setErr] = useState<string | null>(null);
  const lock = useRef(false);

  const handle = async (data: string) => {
    if (lock.current) return;
    lock.current = true;
    try {
      if (isProposalQr(data)) {
        if (purpose === 'address') throw new Error('Este QR es una operación, no una dirección');
        const r = await app.importQr(data);
        success();
        toast(r.isNew ? 'Operación recibida' : r.added > 0 ? r.added > 1 ? t('{n} firmas agregadas', { n: r.added }) : t('1 firma agregada') : 'Sin firmas nuevas', r.added > 0 || r.isNew ? 'ok' : 'warn');
        nav.replace('proposal', { id: r.proposal.id });
        return;
      }
      const addr = parseAddressQr(data);
      if (addr) {
        success();
        if (purpose === 'address' && onAddress) {
          onAddress(addr.address, addr.tag);
          nav.pop();
          return;
        }
        // Escaneo general de una dirección: elegir desde qué cuenta enviar
        const from = app.accounts.find((a) => a.kind === 'wallet' && app.deviceFor(a.address)) ?? app.accounts[0];
        if (from) nav.replace('send', { id: from.id, to: addr.address, tag: addr.tag });
        else throw new Error('Agrega una cuenta para poder enviar');
        return;
      }
      throw new Error('QR no reconocido');
    } catch (e: any) {
      warnBuzz();
      setErr(e?.message ?? String(e));
      setTimeout(() => {
        lock.current = false;
      }, 1500);
    }
  };

  if (!perm) return <Screen title="Escanear" onBack={nav.pop}><Txt v="small">…</Txt></Screen>;
  if (!perm.granted) {
    return (
      <Screen title="Escanear" onBack={nav.pop}>
        <Empty
          icon="camera"
          title="Permite la cámara"
          text="Quorum usa la cámara solo para leer códigos QR de direcciones y operaciones."
          action={
            <View style={{ alignSelf: 'stretch' }}>
              <Button title={perm.canAskAgain ? 'Permitir cámara' : 'Abrir Ajustes'} onPress={() => (perm.canAskAgain ? request() : Linking.openSettings())} />
            </View>
          }
        />
      </Screen>
    );
  }

  return (
    <Screen title={purpose === 'address' ? 'Escanear dirección' : 'Escanear'} onBack={nav.pop} scroll={false} padded={false}>
      <View style={{ flex: 1 }}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={(e) => handle(e.data)}
        />
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={[styles.frame, { borderColor: C.green }]} />
          <Txt v="body" style={{ marginTop: SP.xl, textAlign: 'center', paddingHorizontal: SP.xl }}>
            {purpose === 'address' ? 'Apunta al QR de la dirección' : 'Apunta a un QR de dirección o de una operación de Quorum'}
          </Txt>
          {err && (
            <Pressable onPress={() => setErr(null)} style={{ marginTop: SP.lg, backgroundColor: C.badBg, borderRadius: R.sm, padding: SP.md, flexDirection: 'row', gap: 8 }}>
              <Feather name="alert-triangle" size={16} color={C.bad} />
              <Txt v="small" color={C.text}>
                {err}
              </Txt>
            </Pressable>
          )}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  overlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  frame: { width: 260, height: 260, borderRadius: 28, borderWidth: 3 },
});
