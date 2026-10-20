/**
 * Vista de cámara para leer códigos QR, compartida por la pantalla "Escanear" y por el
 * escáner de direcciones que se abre como ventana sobre un formulario (useAddressScanner).
 */
import React, { useRef, useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import { t } from '../i18n';
import { Button, Empty, Screen, Txt, success, warnBuzz } from './components';
import { C, R, SP } from './theme';
import { isProposalQr, parseAddressQr } from '../core/qr';
import { parsePayRequest } from '../core/payRequest';

export function ScanView({
  title,
  hint,
  onClose,
  onScan,
}: {
  title: string;
  hint: string;
  onClose: () => void;
  /** Recibe el texto del QR. Si lanza un error, se muestra y se puede volver a escanear. */
  onScan: (data: string) => void | Promise<void>;
}) {
  const [perm, request] = useCameraPermissions();
  const [err, setErr] = useState<string | null>(null);
  const lock = useRef(false);

  const handle = async (data: string) => {
    if (lock.current) return;
    lock.current = true;
    try {
      await onScan(data);
    } catch (e: any) {
      warnBuzz();
      setErr(e?.message ?? String(e));
      setTimeout(() => {
        lock.current = false;
      }, 1500);
    }
  };

  if (!perm) return <Screen title={title} onBack={onClose}><Txt v="small">…</Txt></Screen>;
  if (!perm.granted) {
    return (
      <Screen title={title} onBack={onClose}>
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
    <Screen title={title} onBack={onClose} scroll={false} padded={false}>
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
            {hint}
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

type OnAddress = (address: string, tag?: string, amount?: string) => void;

/**
 * Escáner de direcciones para formularios. Se abre como ventana encima de la pantalla actual,
 * así el formulario sigue montado y recibe la dirección (con una pantalla de navegación aparte,
 * la pantalla de origen se desmontaba y el campo quedaba vacío).
 *
 *   const scanner = useAddressScanner();
 *   <Pressable onPress={() => scanner.open((a, tag) => setDest(a))} />
 *   {scanner.modal}
 */
export function useAddressScanner() {
  const [onAddress, setOnAddress] = useState<OnAddress | null>(null);
  const close = () => setOnAddress(null);
  const modal = (
    <Modal visible={!!onAddress} animationType="slide" presentationStyle="fullScreen" onRequestClose={close}>
      {onAddress ? (
        <ScanView
          title="Escanear dirección"
          hint="Apunta al QR de la dirección"
          onClose={close}
          onScan={(data) => {
            if (isProposalQr(data)) throw new Error(t('Este QR es una operación, no una dirección'));
            // un pedido de pago trae también monto (y quizás tag)
            const req = parsePayRequest(data);
            const addr = req ? { address: req.to, tag: req.tag } : parseAddressQr(data);
            if (!addr) throw new Error(t('QR no reconocido'));
            success();
            onAddress(addr.address, addr.tag, req?.amount);
            close();
          }}
        />
      ) : null}
    </Modal>
  );
  return { open: (cb: OnAddress) => setOnAddress(() => cb), modal };
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  frame: { width: 260, height: 260, borderRadius: 28, borderWidth: 3 },
});
