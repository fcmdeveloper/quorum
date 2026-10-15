/**
 * Carga con la X de XRP ("Quórum"): las dos mitades se acercan, se juntan con un brillo y se
 * separan, como dos firmas que se unen. Aparece solo si la espera dura más que `delay`, para no
 * parpadear en cargas rápidas. Con "Reducir movimiento" es un pulso suave sin desplazamientos.
 */
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Defs, G, LinearGradient, Path, Stop } from 'react-native-svg';
import { t } from '../i18n';
import { LOGO_GRADIENT, Txt } from './components';
import { useFrameValues } from './useFrame';

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
  const appear = useRef(new Animated.Value(delay <= 0 ? 1 : 0)).current;
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
    Animated.timing(appear, { toValue: 1, duration: 220, useNativeDriver: true }).start();
    // Un solo ciclo de 1,4 s como en la vista previa: se juntan (45 %), se quedan (15 %), se separan (40 %).
    // Curva seno: arranca y frena suave, sin tirones al dar la vuelta.
    const ease = Easing.inOut(Easing.sin);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(p, { toValue: 1, duration: 630, easing: ease, useNativeDriver: false, isInteraction: false }),
        Animated.delay(210),
        Animated.timing(p, { toValue: 0, duration: 560, easing: ease, useNativeDriver: false, isInteraction: false }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [shown]);

  // Se anima dentro del SVG (se redibuja como vector en cada cuadro): nítido a cualquier tamaño.
  const GAP = reduce ? 0 : 44; // en unidades de la X (512 de ancho)
  const [v] = useFrameValues([p]);
  const fade = (reduce ? 0.45 : 0.35) + (1 - (reduce ? 0.45 : 0.35)) * v;
  const shift = (dir: 1 | -1) => `translate(0 ${dir * GAP * (1 - v)})`;
  // al juntarse, la X late apenas
  const sc = 1 + (reduce ? 0 : 0.04) * Math.max(0, (v - 0.85) / 0.15);
  const beat = `translate(256 212) scale(${sc}) translate(-256 -212)`;
  const PAD = 70; // margen para el desplazamiento y el latido
  const vbH = 424 + PAD * 2;
  const h = (size * vbH) / (512 + PAD * 2);
  const fill = color ?? `url(#${id}g)`;

  const text = label === null ? null : label ?? t('Leyendo el XRP Ledger…');
  return (
    <Animated.View style={{ alignItems: 'center', gap: 12, opacity: appear }} accessibilityRole="progressbar" accessibilityLabel={text ?? t('Cargando')}>
      <Svg width={size} height={h} viewBox={`${-PAD} ${-PAD} ${512 + PAD * 2} ${vbH}`}>
        {!color && (
          <Defs>
            <LinearGradient id={id + 'g'} x1="0" y1="0" x2="512" y2="424" gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={LOGO_GRADIENT.from} />
              <Stop offset="1" stopColor={LOGO_GRADIENT.to} />
            </LinearGradient>
          </Defs>
        )}
        <G transform={beat}>
          <G opacity={fade} transform={shift(-1)}>
            <Path d={XRP_TOP} fill={fill} />
          </G>
          <G opacity={fade} transform={shift(1)}>
            <Path d={XRP_BOTTOM} fill={fill} />
          </G>
        </G>
      </Svg>
      {text ? <Txt v="small">{text}</Txt> : null}
    </Animated.View>
  );
}
