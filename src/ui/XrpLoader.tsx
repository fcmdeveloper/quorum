/**
 * Carga con la X de XRP ("Quórum"): las dos mitades se acercan, se juntan con un brillo y se
 * separan, como dos firmas que se unen. Aparece solo si la espera dura más que `delay`, para no
 * parpadear en cargas rápidas. Con "Reducir movimiento" es un pulso suave sin desplazamientos.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { t } from '../i18n';
import { LOGO_GRADIENT, Txt } from './components';

export const XRP_TOP = 'M437 0h74L357 152.48c-55.77 55.19-146.19 55.19-202 0L0 0h74l117 115.83a91.11 91.11 0 0 0 127.91 0Z';
export const XRP_BOTTOM = 'M74 424H0l155-153.42c55.77-55.19 146.19-55.19 202 0L512 424h-74L321 308.17a91.11 91.11 0 0 0-127.91 0Z';

/** Una mitad de la X (arriba o abajo) en su propio lienzo, con el degradado del logo o un color. */
export function XrpHalf({ half, width, color, id }: { half: 'top' | 'bottom'; width: number; color?: string; id: string }) {
  const h = (width * 424) / 512;
  return (
    <Svg width={width} height={h} viewBox="0 0 512 424">
      {!color && (
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="512" y2="424" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={LOGO_GRADIENT.from} />
            <Stop offset="1" stopColor={LOGO_GRADIENT.to} />
          </LinearGradient>
        </Defs>
      )}
      <Path d={half === 'top' ? XRP_TOP : XRP_BOTTOM} fill={color ?? `url(#${id})`} />
    </Svg>
  );
}

export function XrpLoader({ size = 56, color, label, delay = 300 }: { size?: number; color?: string; label?: string | null; delay?: number }) {
  const [shown, setShown] = useState(delay <= 0);
  const [reduce, setReduce] = useState(false);
  const p = useRef(new Animated.Value(0)).current;
  const id = 'xl' + React.useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    if (delay > 0) {
      const tm = setTimeout(() => setShown(true), delay);
      return () => clearTimeout(tm);
    }
  }, []);

  useEffect(() => {
    if (!shown) return;
    const ease = Easing.inOut(Easing.cubic);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 630, easing: ease, useNativeDriver: true }),
        Animated.delay(210),
        Animated.timing(p, { toValue: 0, duration: 560, easing: ease, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shown]);

  const h = (size * 424) / 512;
  const gap = reduce ? 0 : size * 0.09;
  const top = { transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [-gap, 0] }) }], opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) };
  const bottom = { transform: [{ translateY: p.interpolate({ inputRange: [0, 1], outputRange: [gap, 0] }) }], opacity: p.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }) };
  // brillo: una X más grande y transparente detrás, que se enciende cuando las mitades se juntan
  const glow = { opacity: p.interpolate({ inputRange: [0, 0.8, 1], outputRange: [0, 0, 0.28] }), transform: [{ scale: 1.18 }] };

  const text = label === null ? null : label ?? t('Leyendo el XRP Ledger…');
  return (
    <View style={{ alignItems: 'center', gap: 12, opacity: shown ? 1 : 0 }} accessibilityRole="progressbar" accessibilityLabel={text ?? t('Cargando')}>
      <View style={{ width: size, height: h + gap * 2, justifyContent: 'center', alignItems: 'center' }}>
        <Animated.View style={[{ position: 'absolute', width: size, height: h }, glow]}>
          <View style={{ position: 'absolute', top: 0 }}>
            <XrpHalf half="top" width={size} color={color} id={id + 'g1'} />
          </View>
          <View style={{ position: 'absolute', top: 0 }}>
            <XrpHalf half="bottom" width={size} color={color} id={id + 'g2'} />
          </View>
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', width: size, height: h }, top]}>
          <XrpHalf half="top" width={size} color={color} id={id + 't'} />
        </Animated.View>
        <Animated.View style={[{ position: 'absolute', width: size, height: h }, bottom]}>
          <XrpHalf half="bottom" width={size} color={color} id={id + 'b'} />
        </Animated.View>
      </View>
      {text ? <Txt v="small">{text}</Txt> : null}
    </View>
  );
}
