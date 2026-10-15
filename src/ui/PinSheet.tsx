/**
 * Ventana para crear el código de 4 dígitos (dos veces, deben coincidir) o para confirmar el
 * actual antes de cambiar o quitar el bloqueo.
 */
import React, { useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { checkPin, isWeakPin, lockoutMs, makePinRecord } from '../core/appPin';
import { loadPinFails, loadPinRecord, savePinFails, savePinRecord } from '../store';
import { t } from '../i18n';
import { PinPad } from './PinPad';
import { Button } from './components';
import * as LocalAuthentication from 'expo-local-authentication';
import { C, SP } from './theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function PinSheet({ mode, onDone, onCancel }: { mode: 'create' | 'verify'; onDone: () => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [first, setFirst] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(mode === 'create' ? t('Solo en este teléfono. Quorum no lo guarda ni lo envía: guarda una huella para comprobarlo.') : null);
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [k, setK] = useState(0); // reinicia el teclado entre pasos

  const create = async (pin: string) => {
    if (first === null) {
      if (isWeakPin(pin)) {
        setHint(t('Ese código es muy fácil de adivinar. Elige otro.'));
        return false;
      }
      setFirst(pin);
      setHint(null);
      setK((n) => n + 1);
      return true;
    }
    if (pin !== first) {
      setFirst(null);
      setHint(t('No coinciden. Vuelve a empezar.'));
      return false;
    }
    const salt = Array.from(Crypto.getRandomBytes(16), (b) => b.toString(16).padStart(2, '0')).join('');
    await savePinRecord(makePinRecord(pin, salt));
    await savePinFails({ n: 0, until: 0 });
    onDone();
    return true;
  };

  const verify = async (pin: string) => {
    const f = await loadPinFails();
    if (f.until > Date.now()) {
      setBlockedUntil(f.until);
      return false;
    }
    const rec = await loadPinRecord();
    if (rec && checkPin(pin, rec)) {
      await savePinFails({ n: 0, until: 0 });
      onDone();
      return true;
    }
    const n = f.n + 1;
    const until = Date.now() + lockoutMs(n);
    await savePinFails({ n, until });
    setBlockedUntil(until);
    setHint(t('Código incorrecto'));
    return false;
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: SP.lg, paddingBottom: insets.bottom + SP.lg }}>
        <Pressable onPress={onCancel} hitSlop={12} style={{ alignSelf: 'flex-end', padding: SP.lg }} accessibilityLabel={t('Cancelar')}>
          <Feather name="x" size={24} color={C.dim} />
        </Pressable>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <PinPad
            key={k}
            title={mode === 'verify' ? t('Ingresa tu código actual') : first === null ? t('Crea un código de 4 dígitos') : t('Repite el código')}
            hint={hint}
            onComplete={mode === 'create' ? create : verify}
            blockedUntil={blockedUntil}
          />
          {mode === 'verify' && (
            <Button
              title="Usar Face ID o el código del teléfono"
              kind="ghost"
              style={{ marginTop: SP.lg, marginHorizontal: SP.xl }}
              onPress={async () => {
                const r = await LocalAuthentication.authenticateAsync({ promptMessage: t('Confirmar que eres tú'), disableDeviceFallback: false });
                if (r.success) onDone();
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
