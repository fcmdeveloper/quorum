/**
 * Teclado de código de 4 dígitos (bloqueo con código propio de Quorum).
 * Si el código no sirve, los puntos se sacuden y vibra con el aviso de error.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { PIN_LENGTH } from '../core/appPin';
import { t } from '../i18n';
import { Txt, hapticsEnabled, tap } from './components';
import { C, F, SP } from './theme';

/** Sacudida horizontal (la de "no"). */
export function shake(v: Animated.Value) {
  v.setValue(0);
  Animated.sequence(
    [12, -12, 9, -9, 5, -5, 0].map((x) => Animated.timing(v, { toValue: x, duration: 50, useNativeDriver: true })),
  ).start();
}
export function errorBuzz() {
  if (hapticsEnabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

export function PinPad({
  title,
  hint,
  onComplete,
  blockedUntil = 0,
}: {
  title: string;
  hint?: string | null;
  /** Devuelve false si el código no sirve (se sacude y se borra). */
  onComplete: (pin: string) => Promise<boolean> | boolean;
  /** Mientras no llegue esta hora (ms), no se aceptan intentos. */
  blockedUntil?: number;
}) {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  // Cuenta regresiva: se recalcula con la hora actual cada segundo y se detiene al llegar a 0
  useEffect(() => {
    if (blockedUntil <= Date.now()) return;
    const id = setInterval(() => {
      setTick((n) => n + 1);
      if (Date.now() >= blockedUntil) clearInterval(id);
    }, 500);
    return () => clearInterval(id);
  }, [blockedUntil]);
  const wait = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000));

  const press = async (d: string) => {
    if (busy || wait > 0) return;
    tap();
    if (d === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + d).slice(0, PIN_LENGTH);
    setPin(next);
    if (next.length < PIN_LENGTH) return;
    setBusy(true);
    // deja ver el último punto antes de revisar
    await new Promise((r) => setTimeout(r, 120));
    const ok = await onComplete(next);
    if (!ok) {
      errorBuzz();
      shake(x);
      setTimeout(() => setPin(''), 300);
    }
    setBusy(false);
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={{ alignItems: 'center', gap: SP.lg }}>
      <Txt v="h3">{title}</Txt>
      <Animated.View style={{ flexDirection: 'row', gap: 18, transform: [{ translateX: x }] }} accessibilityLabel={t('{n} de {m} dígitos', { n: pin.length, m: PIN_LENGTH })}>
        {Array.from({ length: PIN_LENGTH }, (_, i) => (
          <View key={i} style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.green, backgroundColor: i < pin.length ? C.green : 'transparent' }} />
        ))}
      </Animated.View>
      <Txt v="small" style={{ minHeight: 20, textAlign: 'center' }} color={wait > 0 ? C.warn : C.dim}>
        {wait > 0 ? t('Demasiados intentos. Espera {s} s.', { s: wait }) : hint ?? ' '}
      </Txt>
      <View style={{ width: 3 * 76 + 2 * 22, flexDirection: 'row', flexWrap: 'wrap', gap: 22, justifyContent: 'center' }}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={{ width: 76, height: 76 }} />
          ) : (
            <Pressable
              key={i}
              onPress={() => press(k)}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? t('Borrar') : k}
              style={({ pressed }) => ({
                width: 76,
                height: 76,
                borderRadius: 38,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: k === 'del' ? 'transparent' : pressed ? C.raised : C.surface,
                borderWidth: k === 'del' ? 0 : 1,
                borderColor: C.line,
                opacity: wait > 0 ? 0.4 : 1,
              })}
            >
              {k === 'del' ? <Feather name="delete" size={24} color={C.dim} /> : <Text style={{ fontFamily: F.semibold, fontSize: 28, color: C.text }}>{k}</Text>}
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}
