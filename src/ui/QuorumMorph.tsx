/**
 * Logo de Quorum que se transforma en la X de XRP: la bóveda gira, se abre y desde el centro
 * nacen las dos mitades de la X. Se usa al desbloquear, en Acerca de (en bucle), en Inicio
 * (ida y vuelta al cambiar la unidad u ocultar saldos) y al crear una bóveda o cuenta (con chispas).
 * Todo se anima dentro del SVG (se redibuja como vector en cada cuadro), así se ve nítido. Con "Reducir movimiento", sin giros ni saltos.
 */
import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { LOGO_GRADIENT } from './components';
import { XRP_BOTTOM, XRP_TOP } from './XrpLoader';
import { useFrameValues } from './useFrame';

import { C } from './theme';

export interface QuorumMorphHandle {
  /** Giro de la rueda + apertura en la X. Queda en la X. */
  unlock: () => Promise<void>;
  /** Bóveda → X → bóveda (sin giro largo). */
  roundTrip: () => Promise<void>;
  /** Como unlock, con chispas desde el centro. Queda en la X. */
  success: () => Promise<void>;
  /** Vuelve a la bóveda sin animación. */
  reset: () => void;
}

// geometría del logo (ver Logo en components.tsx): viewBox 700×650 desde y=-3, rueda en (372, 322)
const LOGO_W = 700;
const LOGO_H = 650;
const LOGO_Y0 = -3;
const DIAL = { cx: 372, cy: 322 };
const X_SCALE = 0.8; // ancho de la X respecto de 512 unidades del logo
const SPARKS = 18;

const run = (a: Animated.CompositeAnimation) => new Promise<void>((res) => a.start(() => res()));

export const QuorumMorph = forwardRef<QuorumMorphHandle, { size?: number; loop?: boolean }>(function QuorumMorph({ size = 88, loop = false }, ref) {
  const dial = useRef(new Animated.Value(0)).current;
  const logoO = useRef(new Animated.Value(1)).current;
  const logoS = useRef(new Animated.Value(1)).current;
  const xIn = useRef(new Animated.Value(0)).current; // 0 = escondida en el centro, 1 = en su lugar
  const glow = useRef(new Animated.Value(0)).current;
  const spark = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState(false);
  const current = useRef<Animated.CompositeAnimation | null>(null);
  const uid = 'qm' + React.useId().replace(/[^a-zA-Z0-9]/g, '');

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
  }, []);

  const k = size / LOGO_W;
  const offY = (size - LOGO_H * k) / 2;
  const cx = DIAL.cx * k;
  const cy = (DIAL.cy - LOGO_Y0) * k + offY;
  // Todo se anima DENTRO del SVG (se redibuja como vector en cada cuadro): nítido a cualquier escala.
  const N = false;
  const travel = reduce ? 0 : 150; // en unidades de la X
  const spin = () =>
    Animated.sequence([
      Animated.timing(dial, { toValue: reduce ? 0 : 135, duration: reduce ? 200 : 520, easing: Easing.bezier(0.45, 0, 0.2, 1), useNativeDriver: N }),
      Animated.spring(dial, { toValue: reduce ? 0 : 120, friction: 6, tension: 180, useNativeDriver: N, restDisplacementThreshold: 0.5, restSpeedThreshold: 2 }),
    ]);
  const open = () =>
    Animated.parallel([
      Animated.timing(logoO, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: N }),
      Animated.timing(logoS, { toValue: reduce ? 1 : 1.22, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: N }),
      Animated.timing(xIn, { toValue: 1, duration: 520, delay: 80, easing: Easing.out(Easing.back(1.6)), useNativeDriver: N }),
      Animated.sequence([
        Animated.delay(300),
        Animated.timing(glow, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: N }),
        Animated.timing(glow, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.sin), useNativeDriver: N }),
      ]),
    ]);
  const close = () =>
    Animated.sequence([
      // la rueda vuelve girando desde -90° (el salto ocurre mientras está invisible)
      Animated.timing(dial, { toValue: reduce ? 0 : -90, duration: 0, useNativeDriver: N }),
      Animated.timing(logoS, { toValue: reduce ? 1 : 0.8, duration: 0, useNativeDriver: N }),
      Animated.parallel([
        Animated.timing(xIn, { toValue: 0, duration: 380, easing: Easing.in(Easing.quad), useNativeDriver: N }),
        Animated.timing(logoO, { toValue: 1, duration: 460, delay: 240, easing: Easing.out(Easing.cubic), useNativeDriver: N }),
        Animated.timing(logoS, { toValue: 1, duration: 460, delay: 240, easing: Easing.out(Easing.back(1.4)), useNativeDriver: N }),
        Animated.timing(dial, { toValue: 0, duration: 560, delay: 280, easing: Easing.out(Easing.cubic), useNativeDriver: N }),
      ]),
    ]);
  const burst = () =>
    Animated.sequence([
      Animated.timing(spark, { toValue: 0, duration: 0, useNativeDriver: N }),
      Animated.timing(spark, { toValue: 1, duration: 900, easing: Easing.bezier(0.1, 0.7, 0.3, 1), useNativeDriver: N }),
    ]);

  const play = (a: Animated.CompositeAnimation) => {
    current.current?.stop();
    current.current = a;
    return run(a);
  };
  const reset = () => {
    current.current?.stop();
    [dial, xIn, glow, spark].forEach((v) => v.setValue(0));
    logoO.setValue(1);
    logoS.setValue(1);
  };

  useImperativeHandle(ref, () => ({
    unlock: () => play(Animated.sequence([spin(), open()])),
    roundTrip: () => {
      reset();
      return play(
        Animated.sequence([
          Animated.timing(dial, { toValue: reduce ? 0 : 60, duration: reduce ? 0 : 260, easing: Easing.bezier(0.45, 0, 0.2, 1), useNativeDriver: N }),
          open(),
          Animated.delay(250),
          close(),
        ]),
      );
    },
    success: () => play(Animated.sequence([spin(), Animated.parallel([open(), Animated.sequence([Animated.delay(160), burst()])])])),
    reset,
  }));

  // Acerca de: ciclo continuo y tranquilo
  useEffect(() => {
    if (!loop) return;
    const a = Animated.loop(Animated.sequence([Animated.delay(600), spin(), open(), Animated.delay(1500), close(), Animated.delay(800)]));
    current.current = a;
    a.start();
    return () => a.stop();
  }, [loop, reduce]);

  // valores actuales (se redibuja el SVG en cada cuadro)
  const [vDial, vO, vS, vX, vGlow] = useFrameValues([dial, logoO, logoS, xIn, glow]);
  const about = (cxv: number, cyv: number, sc: number) => `translate(${cxv} ${cyv}) scale(${sc}) translate(${-cxv} ${-cyv})`;
  const half = (dir: 1 | -1) => `translate(0 ${dir * travel * (1 - vX)}) ${about(256, 212, 0.55 + 0.45 * vX)}`;
  const xOpacity = Math.max(0, Math.min(1, vX / 0.35));
  const g = `url(#${uid}g)`;
  const M = 0.15; // margen del lienzo para que el logo pueda crecer sin recortarse
  const arms = [
    [372, 249, 372, 166],
    [308.8, 358.5, 237, 400],
    [435.2, 358.5, 507, 400],
  ];

  return (
    <View style={{ width: size, height: size }}>
      <Svg
        style={{ position: 'absolute', left: -size * M, top: -size * M }}
        width={size * (1 + 2 * M)}
        height={size * (1 + 2 * M)}
        viewBox={`${-LOGO_W * M} ${LOGO_Y0 - offY / k - LOGO_W * M} ${LOGO_W * (1 + 2 * M)} ${LOGO_W * (1 + 2 * M)}`}
      >
        <Defs>
          <LinearGradient id={uid + 'g'} x1="50" y1="-10" x2="690" y2="670" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={LOGO_GRADIENT.from} />
            <Stop offset="1" stopColor={LOGO_GRADIENT.to} />
          </LinearGradient>
        </Defs>
        {/* bóveda: marco, puerta y rueda */}
        <G opacity={vO} transform={about(DIAL.cx, DIAL.cy, vS)}>
          <Rect x={72} y={22} width={600} height={600} rx={112} fill="none" stroke={g} strokeWidth={44} />
          <Rect x={26} y={128} width={62} height={96} rx={20} fill={g} />
          <Rect x={26} y={420} width={62} height={96} rx={20} fill={g} />
          <Circle cx={DIAL.cx} cy={DIAL.cy} r={196} fill="none" stroke={g} strokeWidth={30} opacity={0.55} />
          <G transform={`rotate(${vDial} ${DIAL.cx} ${DIAL.cy})`}>
            <G stroke={g} strokeWidth={38} strokeLinecap="round">
              {arms.map(([x1, y1, x, y]) => (
                <Line key={`${x}-${y}`} x1={x1} y1={y1} x2={x} y2={y} />
              ))}
            </G>
            {arms.map(([, , x, y]) => (
              <Circle key={`d${x}-${y}`} cx={x} cy={y} r={34} fill={g} />
            ))}
            <Circle cx={DIAL.cx} cy={DIAL.cy} r={58} fill={C.bg} stroke={g} strokeWidth={30} />
          </G>
        </G>
        {/* X de XRP, centrada en la rueda */}
        <G transform={`translate(${DIAL.cx} ${DIAL.cy}) scale(${X_SCALE}) translate(-256 -212)`}>
          <G transform={about(256, 212, 1 + (reduce ? 0 : 0.06) * vGlow)}>
            <G opacity={xOpacity} transform={half(1)}>
              <Path d={XRP_TOP} fill={g} />
            </G>
            <G opacity={xOpacity} transform={half(-1)}>
              <Path d={XRP_BOTTOM} fill={g} />
            </G>
          </G>
        </G>
      </Svg>
      {/* chispas (puntos chicos que se achican: no se pixelan) */}
      <View pointerEvents="none" style={{ position: 'absolute', left: cx, top: cy }}>
        {Array.from({ length: SPARKS }, (_, i) => {
          const a = (i / SPARKS) * Math.PI * 2 + (i % 3) * 0.12;
          const r = size * (0.85 + (i % 4) * 0.18);
          const d = Math.max(3, size * (0.035 + (i % 3) * 0.015));
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute',
                left: -d / 2,
                top: -d / 2,
                width: d,
                height: d,
                borderRadius: d / 2,
                backgroundColor: i % 4 === 0 ? C.text : C.green,
                opacity: spark.interpolate({ inputRange: [0, 0.05, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * r] }) },
                  { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * r] }) },
                  { scale: spark.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
                ],
              }}
            />
          );
        })}
      </View>
    </View>
  );
});
