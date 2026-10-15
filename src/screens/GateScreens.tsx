import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NeverAskCard, ResponsibilityList } from '../ui/legalBlocks';
import { TERMS_VERSION } from '../legal';
import * as Haptics from 'expo-haptics';
import * as LocalAuthentication from 'expo-local-authentication';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { Button, Logo, Txt, hapticsEnabled, tap } from '../ui/components';
import { C, SP } from '../ui/theme';
import { QuorumMorph, QuorumMorphHandle } from '../ui/QuorumMorph';
import { PinPad, errorBuzz, shake } from '../ui/PinPad';
import { checkPin, lockoutMs } from '../core/appPin';
import { loadPinFails, loadPinRecord, savePinFails } from '../store';
import { t } from '../i18n';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type HapticFn = () => Promise<void>;

/**
 * Ejecuta una vibración apenas iOS la permita: iOS descarta las vibraciones mientras
 * la app no está "active", y justo después de Face ID la app sigue "inactive" un
 * instante. En vez de esperar un tiempo fijo, se escucha el evento de iOS.
 */
function whenActive(fn: HapticFn, giveUpMs = 1500) {
  if (AppState.currentState === 'active') {
    fn().catch(() => {});
    return;
  }
  let done = false;
  const sub = AppState.addEventListener('change', (st) => {
    if (st !== 'active' || done) return;
    done = true;
    sub.remove();
    setTimeout(() => fn().catch(() => {}), 30);
  });
  setTimeout(() => {
    if (!done) {
      done = true;
      sub.remove();
    }
  }, giveUpMs);
}

/**
 * Secuencia háptica del desbloqueo (también la usa "Probar vibración" en Ajustes):
 * clics mientras gira la rueda, un golpe cuando cede la cerradura y el aviso de éxito.
 * Los clics son decorativos (si iOS aún no deja vibrar, se omiten); el golpe y el
 * aviso de éxito esperan a que iOS lo permita.
 */
export function unlockHaptics(force = false) {
  if (!force && !hapticsEnabled()) return;
  [0, 90, 180, 270].forEach((t) =>
    setTimeout(() => {
      if (AppState.currentState === 'active') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, t),
  );
  setTimeout(() => whenActive(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy)), 430);
  setTimeout(() => whenActive(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)), 700);
}

/** Espera (hasta `max` ms) a que la app esté en primer plano. Face ID falla si se pide antes. */
async function untilActive(max = 2000) {
  for (let t = 0; t < max && AppState.currentState !== 'active'; t += 50) await sleep(50);
}

/**
 * Bloqueo biométrico: al abrir la app y al volver de segundo plano (pasado `graceSec`).
 * - El cuadro de Face ID cambia la app a "inactive" (no a "background"), así que no
 *   provoca un nuevo bloqueo: solo cuenta salir de verdad de la app.
 * - Mientras se autentica se ignoran los cambios de estado.
 */
export function useAppLock(enabled: boolean, ready: boolean, graceSec = 0, suspended = false) {
  const [locked, setLocked] = useState(false);
  const bgAt = useRef<number | null>(null);
  const authing = useRef(false);
  const lockedAtLaunch = useRef(false);
  // mientras hay una operación en curso (p. ej. esperando la firma en Xaman) no se bloquea
  // al volver: si no, cada ida y vuelta a Xaman pediría Face ID.
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  // Bloqueo al abrir la app (una sola vez, cuando ya se cargaron los ajustes)
  useEffect(() => {
    if (ready && enabled && !lockedAtLaunch.current) {
      lockedAtLaunch.current = true;
      setLocked(true);
    }
    if (!enabled) setLocked(false);
  }, [ready, enabled]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (authing.current) return;
      if (s === 'background') {
        bgAt.current = Date.now();
        return;
      }
      if (s === 'active') {
        const left = bgAt.current;
        bgAt.current = null; // se consume: un mismo regreso no bloquea dos veces
        if (enabled && !suspendedRef.current && left !== null && Date.now() - left >= graceSec * 1000) setLocked(true);
      }
    });
    return () => sub.remove();
  }, [enabled, graceSec]);

  /** Deja pasar la app: animación (como máximo 3 s, nunca la traba) y vibración de éxito. */
  const finish = async (opening?: () => Promise<void>) => {
    if (opening) await Promise.race([opening().catch(() => {}), sleep(3000)]);
    setLocked(false);
    // Durante el giro iOS suele no permitir vibrar todavía (vuelve de Face ID); al aparecer la app ya está activa.
    if (hapticsEnabled()) setTimeout(() => whenActive(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 3000), 60);
  };

  /**
   * Face ID con dos intentos: si el primero no reconoce la cara, se avisa (`onFail`: vibración de
   * "no" y el botón se sacude) y se intenta de nuevo; el segundo intento ofrece el código del teléfono.
   * Cancelar no cuenta como intento fallido.
   */
  const unlock = async (opening?: () => Promise<void>, onFail?: () => void) => {
    if (authing.current) return;
    authing.current = true;
    try {
      await untilActive();
      const cancelled = (e?: string) => e === 'user_cancel' || e === 'system_cancel' || e === 'app_cancel';
      const r1 = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear Quorum', cancelLabel: 'Cancelar', disableDeviceFallback: true });
      if (r1.success) return await finish(opening);
      if (cancelled((r1 as any).error)) return;
      onFail?.();
      await sleep(650);
      await untilActive();
      const r2 = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desbloquear Quorum', cancelLabel: 'Cancelar', fallbackLabel: 'Usar código del teléfono', disableDeviceFallback: false });
      if (r2.success) return await finish(opening);
      if (!cancelled((r2 as any).error)) onFail?.();
    } catch {
      // si Face ID falla por cualquier motivo, se queda bloqueada y el botón sigue disponible
    } finally {
      // deja pasar los eventos de AppState que provoca el propio cuadro de Face ID
      setTimeout(() => {
        authing.current = false;
        bgAt.current = null;
      }, 800);
    }
  };
  // Al abrir la app el bloqueo vale desde el primer dibujo (el efecto de arriba llega un cuadro tarde).
  return { locked: locked || (ready && enabled && !lockedAtLaunch.current), unlock, finish };
}

export function LockScreen({
  onUnlock,
  onFinish,
  method = 'faceid',
}: {
  onUnlock: (opening?: () => Promise<void>, onFail?: () => void) => void;
  /** Con código: ya verificado, solo falta abrir. */
  onFinish: (opening?: () => Promise<void>) => void;
  method?: 'faceid' | 'pin';
}) {
  const morph = useRef<QuorumMorphHandle>(null);
  const fade = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const btnX = useRef(new Animated.Value(0)).current;
  const [hint, setHint] = useState<string | null>(null);
  const [blockedUntil, setBlockedUntil] = useState(0);

  // Tras desbloquear: la rueda gira como la cerradura de una caja fuerte, la bóveda se abre
  // y se transforma en la X de XRP, y la pantalla se desvanece hacia la app.
  const opening = async () => {
    await (morph.current?.unlock() ?? Promise.resolve());
    await new Promise<void>((resolve) =>
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 260, delay: 220, useNativeDriver: true }),
        // sin agrandar: escalar una vista ya dibujada la pixela
        Animated.timing(scale, { toValue: 0.98, duration: 320, delay: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]).start(() => resolve()),
    );
  };

  // Face ID no reconoció: vibración de "no" y el botón se sacude; se intenta otra vez.
  const failed = () => {
    errorBuzz();
    shake(btnX);
    setHint(t('No se reconoció. Intenta de nuevo.'));
  };
  const tryUnlock = () => {
    setHint(null);
    onUnlock(opening, failed);
  };

  // Código propio: se compara con la huella guardada; tras varios errores hay que esperar.
  useEffect(() => {
    if (method === 'pin') loadPinFails().then((f) => setBlockedUntil(f.until));
  }, [method]);
  const checkCode = async (pin: string) => {
    const f = await loadPinFails();
    if (f.until > Date.now()) {
      setBlockedUntil(f.until);
      return false;
    }
    const rec = await loadPinRecord();
    if (rec && checkPin(pin, rec)) {
      await savePinFails({ n: 0, until: 0 });
      onFinish(opening);
      return true;
    }
    const n = f.n + 1;
    const until = Date.now() + lockoutMs(n);
    await savePinFails({ n, until });
    setBlockedUntil(until);
    setHint(n >= 3 ? t('Código incorrecto ({n} intentos)', { n }) : t('Código incorrecto'));
    return false;
  };

  // Pide Face ID solo: al aparecer la pantalla y cada vez que la app vuelve a primer plano
  // estando bloqueada. Una sola vez por cada regreso (el cuadro de Face ID no cuenta como salir).
  const askedThisVisit = useRef(false);
  useEffect(() => {
    if (method !== 'faceid') return;
    const ask = () => {
      if (askedThisVisit.current) return;
      askedThisVisit.current = true;
      setTimeout(tryUnlock, 250);
    };
    if (AppState.currentState === 'active') ask();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') askedThisVisit.current = false;
      if (st === 'active') ask();
    });
    return () => sub.remove();
  }, [method]);

  return (
    <Animated.View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: SP.xl, opacity: fade }}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <QuorumMorph ref={morph} size={method === 'pin' ? 64 : 88} />
      </Animated.View>
      <Txt v="h1" style={{ marginTop: method === 'pin' ? SP.md : SP.xl }}>
        Quorum
      </Txt>
      {method === 'pin' ? (
        <View style={{ marginTop: SP.xl }}>
          <PinPad title={t('Ingresa tu código')} hint={hint} onComplete={checkCode} blockedUntil={blockedUntil} />
          {/* Si olvidaste el código (o se perdió al cambiar de teléfono): Face ID o el código del teléfono */}
          <Button title="Usar Face ID o el código del teléfono" kind="ghost" onPress={tryUnlock} style={{ marginTop: SP.lg }} />
        </View>
      ) : (
        <>
          <Txt v="small" style={{ marginTop: 4 }} color={hint ? C.warn : C.dim}>
            {hint ?? t('Bloqueado')}
          </Txt>
          <Animated.View style={{ alignSelf: 'stretch', marginTop: SP.xxl, transform: [{ translateX: btnX }] }}>
            <Button title="Desbloquear" icon="unlock" onPress={tryUnlock} />
          </Animated.View>
        </>
      )}
    </Animated.View>
  );
}

const POINTS: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string }[] = [
  { icon: 'users', title: 'Varias firmas', text: 'Tus fondos solo se mueven cuando firman los dispositivos que elijas: Tangem, Ledger o Xaman.' },
  { icon: 'key', title: 'Tus claves, en tus dispositivos', text: 'Quorum no guarda claves privadas. Solo coordina las firmas.' },
  { icon: 'maximize', title: 'Sin servidores', text: 'Para firmar desde otro teléfono, se intercambian códigos QR. Nada pasa por internet salvo la red XRPL.' },
];

export function Onboarding() {
  const app = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg, padding: SP.xl, justifyContent: 'center' }}>
      <Logo size={72} />
      <Txt v="hero" style={{ marginTop: SP.xl }}>
        Quorum
      </Txt>
      <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.xxl }}>
        Bóvedas multifirma para el XRP Ledger.
      </Txt>
      {POINTS.map((p) => (
        <View key={p.title} style={{ flexDirection: 'row', gap: SP.lg, marginBottom: SP.xl }}>
          <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name={p.icon} size={20} color={C.green} />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h3">{p.title}</Txt>
            <Txt v="small">{p.text}</Txt>
          </View>
        </View>
      ))}
      <Button title="Empezar" onPress={() => app.updateSettings({ onboarded: true })} style={{ marginTop: SP.lg }} />
      <Txt v="small" style={{ textAlign: 'center', marginTop: SP.md }}>
        Gratis, sin fines de lucro y de código abierto.
      </Txt>
    </View>
  );
}

/**
 * Aviso de responsabilidad: aparece al abrir Quorum por primera vez (y si cambia el texto).
 * Hay que aceptarlo para seguir.
 */
export function TermsScreen() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [ok, setOk] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: SP.xl, paddingTop: insets.top + SP.xl, paddingBottom: insets.bottom + 40 }}>
        <Logo size={56} />
        <Txt v="h1" style={{ marginTop: SP.lg }}>
          Antes de empezar
        </Txt>
        <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.lg }}>
          Léelo con calma: es importante para cuidar tus fondos.
        </Txt>
        <ResponsibilityList />
        <View style={{ marginTop: SP.lg }}>
          <NeverAskCard />
        </View>
        <Pressable
          onPress={() => {
            tap();
            setOk((v) => !v);
          }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: SP.md }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ok }}
        >
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              borderWidth: 2,
              borderColor: ok ? C.green : C.lineStrong,
              backgroundColor: ok ? C.green : 'transparent',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {ok ? <Feather name="check" size={16} color={C.greenInk} /> : null}
          </View>
          <Txt v="body" style={{ flex: 1 }}>
            Entiendo que soy responsable de mis dispositivos, respaldos y de lo que firmo.
          </Txt>
        </Pressable>
        <Button title="Aceptar y continuar" disabled={!ok} onPress={() => app.updateSettings({ termsAccepted: TERMS_VERSION, reviewedAt: Date.now() })} />
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: SP.xl }}>
          <Feather name="heart" size={14} color={C.bad} />
          <Txt v="small" style={{ textAlign: 'center' }}>
            Quorum es gratis y sin fines de lucro. Si te sirve, puedes apoyarlo con una donación desde Ajustes → Acerca de.
          </Txt>
        </View>
      </ScrollView>
    </View>
  );
}
