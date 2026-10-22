/**
 * Avisos y menús en Android: `patchAlert` envía aquí todos los Alert.alert. El aviso del sistema
 * de Android se ve distinto al resto de la app y muestra como máximo tres botones (con más, los
 * demás desaparecen sin aviso, como pasaba con "Quitar de Quorum"). En iOS siguen siendo el aviso
 * del sistema. Mismos botones, mismo orden; "Cancelar" queda al final, aparte.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setAlertOverflow, AlertButton } from '../i18n/alert';
import { Txt } from './components';
import { C, R, SP } from './theme';

type Sheet = { title?: string; message?: string; buttons: AlertButton[]; cancelable: boolean };

export function ActionSheetHost() {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const insets = useSafeAreaInsets();
  useEffect(() => {
    setAlertOverflow((title, message, buttons, options) => setSheet({ title, message, buttons, cancelable: options?.cancelable === true }));
    return () => setAlertOverflow(null);
  }, []);
  if (!sheet) return null;
  const cancel = sheet.buttons.find((b) => b.style === 'cancel');
  const rest = sheet.buttons.filter((b) => b !== cancel);
  const pick = (b?: AlertButton) => {
    setSheet(null);
    // después de cerrar: si la opción abre otro aviso, no choca con este
    if (b?.onPress) setTimeout(() => b.onPress!(), 50);
  };
  // tocar fuera o "atrás": cancela si hay "Cancelar"; si hay un solo botón (un aviso con "OK"), es ese
  const close = () => (cancel ? pick(cancel) : rest.length === 1 ? pick(rest[0]) : sheet.cancelable ? pick() : undefined);
  const Row = ({ b, bold }: { b: AlertButton; bold?: boolean }) => (
    <Pressable
      onPress={() => pick(b)}
      android_ripple={{ color: C.line }}
      style={{ paddingVertical: 16, paddingHorizontal: SP.lg, alignItems: 'center' }}
      accessibilityRole="button"
    >
      <Txt v="body" color={b.style === 'destructive' ? C.bad : C.text} style={bold ? { fontWeight: '600' } : undefined}>
        {b.text ?? ''}
      </Txt>
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={close}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
        <Pressable onPress={() => {}} style={{ marginHorizontal: SP.md, marginBottom: insets.bottom + SP.md, gap: SP.sm }}>
          <View style={{ backgroundColor: C.raised, borderRadius: R.lg, overflow: 'hidden' }}>
            {sheet.title || sheet.message ? (
              <View style={{ padding: SP.lg, paddingBottom: SP.md, alignItems: 'center', gap: 4 }}>
                {sheet.title ? <Txt v="h3">{sheet.title}</Txt> : null}
                {sheet.message ? (
                  // un mensaje largo (p. ej. un error con su causa) se desplaza en vez de tapar los botones
                  <ScrollView style={{ maxHeight: 320, alignSelf: 'stretch' }} contentContainerStyle={{ alignItems: 'center' }}>
                    <Txt v="small" style={{ textAlign: 'center' }}>
                      {sheet.message}
                    </Txt>
                  </ScrollView>
                ) : null}
              </View>
            ) : null}
            {rest.map((b, i) => (
              <View key={i} style={{ borderTopWidth: i || sheet.title || sheet.message ? 1 : 0, borderTopColor: C.line }}>
                <Row b={b} />
              </View>
            ))}
          </View>
          {cancel ? (
            <View style={{ backgroundColor: C.raised, borderRadius: R.lg, overflow: 'hidden' }}>
              <Row b={cancel} bold />
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
