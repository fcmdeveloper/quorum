import React, { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { Feather } from '@expo/vector-icons';
import { Glass } from './Glass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F } from './theme';
import { toast } from './components';
import { t } from '../i18n';

/**
 * Aviso flotante cuando el teléfono no tiene internet. Al volver la conexión,
 * se oculta y recarga los saldos.
 */
export function OfflineBanner({ onBackOnline }: { onBackOnline?: () => void }) {
  const insets = useSafeAreaInsets();
  const [offline, setOffline] = useState(false);
  const wasOffline = useRef(false);
  const y = useRef(new Animated.Value(-80)).current;

  useEffect(() => {
    const unsub = NetInfo.addEventListener((s) => {
      // isInternetReachable puede venir null mientras se comprueba: solo cuenta false explícito
      const off = s.isConnected === false || s.isInternetReachable === false;
      setOffline(off);
      if (off) wasOffline.current = true;
      else if (wasOffline.current) {
        wasOffline.current = false;
        toast('Conexión restablecida');
        onBackOnline?.();
      }
    });
    return () => unsub();
  }, [onBackOnline]);

  useEffect(() => {
    Animated.spring(y, { toValue: offline ? 0 : -80, useNativeDriver: true, friction: 8 }).start();
  }, [offline]);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 4,
        alignSelf: 'center',
        transform: [{ translateY: y }],
        opacity: offline ? 1 : 0,
      }}
    >
      <Glass
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 }}
        fallback={{ backgroundColor: C.surface, borderWidth: 1, borderColor: C.warn }}
      >
        <Feather name="wifi-off" size={14} color={C.warn} />
        <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.warn }}>{t('Sin conexión · saldos sin actualizar')}</Text>
      </Glass>
    </Animated.View>
  );
}
