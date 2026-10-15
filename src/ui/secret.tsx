/**
 * Números secretos de una bóveda creada en Quorum: mostrarlos una vez y volver a
 * escribirlos para firmar. Nada de esto se guarda: vive en el estado de la pantalla y
 * se borra al cerrarla.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { Button, Notice, Txt } from './components';
import { C, F, R, SP } from './theme';
import { ROW_LETTERS, SECRET_ROWS, addressFromSecret, rowValid } from '../core/seedVault';

/**
 * Impide capturas y grabaciones de pantalla mientras `active` sea true. Si la app todavía
 * no se recompiló con expo-screen-capture, no hace nada (y no rompe).
 */
export function useNoScreenCapture(active: boolean, key = 'secret') {
  useEffect(() => {
    if (!active) return;
    let mod: any = null;
    try {
      mod = require('expo-screen-capture');
      mod.preventScreenCaptureAsync(key).catch(() => {});
    } catch {
      mod = null;
    }
    return () => {
      mod?.allowScreenCaptureAsync(key).catch(() => {});
    };
  }, [active, key]);
}

/** Casilla de confirmación. */
export function CheckRow({ on, onChange, text }: { on: boolean; onChange: (v: boolean) => void; text: string }) {
  return (
    <Pressable
      onPress={() => onChange(!on)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      style={{ flexDirection: 'row', gap: SP.md, alignItems: 'flex-start', paddingVertical: SP.sm }}
    >
      <Feather name={on ? 'check-square' : 'square'} size={22} color={on ? C.green : C.faint} style={{ marginTop: 1 }} />
      <Txt v="body" style={{ flex: 1 }}>
        {text}
      </Txt>
    </Pressable>
  );
}

/** Las 8 filas, para anotarlas en papel. No se pueden seleccionar ni copiar. */
export function SecretGrid({ rows }: { rows: string[] }) {
  return (
    <View style={{ borderWidth: 1, borderColor: C.lineStrong, borderRadius: R.md, padding: SP.md, gap: 6 }}>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.dim, width: 22 }}>{ROW_LETTERS[i]}</Text>
          <Text selectable={false} style={{ fontFamily: F.monoMedium, fontSize: 24, letterSpacing: 4, color: C.text }}>
            {r.slice(0, 3)} {r.slice(3)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Hoja para escribir los números secretos. Solo deja continuar si las 8 filas son válidas
 * y corresponden a `address`. Al cerrarse, borra lo escrito.
 */
export function SecretEntrySheet({
  visible,
  address,
  title,
  text,
  confirm,
  onCancel,
  onSubmit,
  testnet,
}: {
  visible: boolean;
  /** Bóveda de testnet: se recuerda que los mismos números valen en mainnet. */
  testnet?: boolean;
  address: string;
  title: string;
  text: string;
  confirm: string;
  onCancel: () => void;
  onSubmit: (rows: string[]) => void;
}) {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<string[]>(() => Array(SECRET_ROWS).fill(''));
  const refs = useRef<(TextInput | null)[]>([]);
  useNoScreenCapture(visible, 'secret-entry');

  useEffect(() => {
    if (!visible) setRows(Array(SECRET_ROWS).fill(''));
  }, [visible]);

  const valid = rows.map((r, i) => rowValid(i, r));
  const complete = valid.every(Boolean);
  let matches = false;
  if (complete) {
    try {
      matches = addressFromSecret(rows) === address;
    } catch {
      matches = false;
    }
  }

  const close = (fn: () => void) => {
    setRows(Array(SECRET_ROWS).fill(''));
    fn();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => close(onCancel)}>
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: SP.xl, paddingBottom: insets.bottom + SP.xxl }}>
          <Txt v="h2">{title}</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.lg }}>
            {text}
          </Txt>
          {testnet ? <TestnetSecretNotice /> : null}
          {rows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, marginBottom: SP.sm }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.dim, width: 22 }}>{ROW_LETTERS[i]}</Text>
              <TextInput
                ref={(x) => {
                  refs.current[i] = x;
                }}
                value={r}
                onChangeText={(v) => {
                  const clean = v.replace(/\D/g, '').slice(0, 6);
                  setRows((p) => p.map((x, j) => (j === i ? clean : x)));
                  if (clean.length === 6 && rowValid(i, clean) && i < SECRET_ROWS - 1) refs.current[i + 1]?.focus();
                }}
                keyboardType="number-pad"
                maxLength={6}
                autoCorrect={false}
                autoComplete="off"
                textContentType="none"
                importantForAutofill="no"
                contextMenuHidden
                style={{
                  flex: 1,
                  fontFamily: F.monoMedium,
                  fontSize: 22,
                  letterSpacing: 4,
                  color: C.text,
                  borderWidth: 1,
                  borderRadius: R.sm,
                  borderColor: r.length === 6 ? (valid[i] ? C.green : C.bad) : C.line,
                  paddingHorizontal: SP.md,
                  paddingVertical: 10,
                }}
              />
              <Feather name={valid[i] ? 'check-circle' : r.length === 6 ? 'x-circle' : 'circle'} size={20} color={valid[i] ? C.green : r.length === 6 ? C.bad : C.faint} />
            </View>
          ))}
          {complete && !matches && <Notice kind="bad">{t('Estos números no corresponden a esta bóveda ({a}…). Revisa que sean los de esta cuenta.', { a: address.slice(0, 8) })}</Notice>}
          <Button
            title={confirm}
            icon="edit-3"
            disabled={!matches}
            onPress={() => {
              const copy = [...rows];
              close(() => onSubmit(copy));
            }}
          />
          <Button title="Cancelar" kind="ghost" onPress={() => close(onCancel)} />
        </ScrollView>
      </View>
    </Modal>
  );
}

/**
 * Las llaves del XRP Ledger no dependen de la red: los mismos números controlan la misma dirección
 * en mainnet, donde sería una cuenta normal (sin firmantes, con la master key activa).
 */
export function TestnetSecretNotice() {
  return (
    <Notice kind="warn">
      Estos números son de prueba. La misma dirección existe en mainnet: nunca le envíes fondos reales. Para mainnet, crea una bóveda nueva con números nuevos.
    </Notice>
  );
}
