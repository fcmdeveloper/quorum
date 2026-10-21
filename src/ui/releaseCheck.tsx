/**
 * Avisa si esta app no es una versión registrada por el Consejo en el XRP Ledger.
 * Se consulta al abrir la app, al volver a ella y cada 24 horas. Nunca bloquea:
 * muestra un aviso en Inicio y pide confirmación antes de firmar en mainnet.
 */
import React, { useEffect, useState } from 'react';
import { Alert, AppState, Pressable, View } from 'react-native';
import Constants from 'expo-constants';
import { Feather } from '@expo/vector-icons';
import { t } from '../i18n';
import { Txt } from './components';
import { C, R, SP } from './theme';
import { appCodeHash, thisPlatform } from './appHash';
import { QUORUM } from '../config';
import { fetchReleaseLog, releaseStatus } from '../core/releases';
import { classifyRelease, isStale, needsSignConfirm, ReleaseCheckState } from '../core/releaseCheck';
import type { NetworkId } from '../core/network';

let state: ReleaseCheckState | null = null;
let reason: string | undefined;
let lastCheck: number | null = null;
let running: Promise<void> | null = null;
/** Confirmado una vez en esta sesión: no se vuelve a preguntar hasta reabrir la app. */
let acknowledged = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function checkRelease(force = false): Promise<void> {
  if (running) return running;
  if (!force && !isStale(lastCheck, state, Date.now())) return;
  running = (async () => {
    try {
      const hash = await appCodeHash();
      if (!hash) {
        state = 'dev';
      } else {
        const version = Constants.expoConfig?.version ?? '';
        const s = releaseStatus(await fetchReleaseLog('mainnet', QUORUM.releasesAddress), version, hash, thisPlatform());
        state = classifyRelease(s);
        reason = s.revoked?.reason;
      }
    } catch {
      // sin conexión: se mantiene el último resultado conocido si lo hay
      if (state === null || state === 'unknown') state = 'unknown';
    }
    lastCheck = Date.now();
    running = null;
    emit();
  })();
  return running;
}

/** Estado actual; consulta al montar, al volver a la app y cuando pasa el plazo. */
export function useReleaseCheck(): ReleaseCheckState | null {
  const [, set] = useState(0);
  useEffect(() => {
    const l = () => set((n) => n + 1);
    listeners.add(l);
    checkRelease();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkRelease();
    });
    const timer = setInterval(() => checkRelease(), 60 * 60 * 1000);
    return () => {
      listeners.delete(l);
      sub.remove();
      clearInterval(timer);
    };
  }, []);
  return state;
}

function texts(s: ReleaseCheckState): { title: string; text: string; bad: boolean } | null {
  switch (s) {
    case 'unregistered':
      return { bad: false, title: t('Versión no registrada'), text: t('Esta versión no está registrada en el XRP Ledger. Si no es un build de prueba tuyo, úsala solo en testnet.') };
    case 'mismatch':
      return { bad: true, title: t('Esta app no coincide con el registro'), text: t('No es el código publicado de esta versión. No firmes en mainnet con esta app.') };
    case 'revoked':
      return { bad: true, title: t('Versión retirada'), text: reason ? t('El Consejo retiró esta versión: {x}. Actualiza la app.', { x: reason }) : t('El Consejo retiró esta versión. Actualiza la app.') };
    case 'disputed':
      return { bad: true, title: t('Validación con problemas'), text: t('Un validador reportó que esta versión no coincide con el código publicado. Revisa los detalles.') };
    default:
      return null;
  }
}

/** Aviso para Inicio. Toca para abrir "Verificar esta versión". */
export function ReleaseBanner({ onOpen }: { onOpen: () => void }) {
  const s = useReleaseCheck();
  const x = s ? texts(s) : null;
  if (!x) return null;
  const color = x.bad ? C.bad : C.warn;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1, marginBottom: SP.lg, flexDirection: 'row', gap: 10, alignItems: 'flex-start', padding: SP.md, borderRadius: R.sm, borderWidth: 1, backgroundColor: color + '14', borderColor: color + '40' })}
    >
      <Feather name={x.bad ? 'alert-octagon' : 'alert-triangle'} size={18} color={color} style={{ marginTop: 2 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Txt v="h3" color={color}>{x.title}</Txt>
        <Txt v="small" color={C.text}>{x.text}</Txt>
      </View>
      <Feather name="chevron-right" size={18} color={C.dim} style={{ marginTop: 2 }} />
    </Pressable>
  );
}

/**
 * Antes de firmar o enviar en mainnet: si esta versión no está validada, pide confirmación
 * (una vez por sesión). En testnet, en desarrollo o sin conexión sigue directo.
 */
export function confirmValidated(network: NetworkId, go: () => void): void {
  if (network !== 'mainnet' || acknowledged || !state || !needsSignConfirm(state)) return go();
  const x = texts(state)!;
  Alert.alert(x.title, `${x.text}\n\n${t('¿Firmar igual en mainnet?')}`, [
    { text: t('Cancelar'), style: 'cancel' },
    {
      text: t('Firmar igual'),
      style: 'destructive',
      onPress: () => {
        acknowledged = true;
        go();
      },
    },
  ]);
}

/** Solo para pruebas. */
export function __setReleaseState(s: ReleaseCheckState | null, ack = false) {
  state = s;
  acknowledged = ack;
}
