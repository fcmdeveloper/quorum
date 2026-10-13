/**
 * Gráfico de línea simple (react-native-svg) con área degradada y lectura al deslizar el dedo.
 */
import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { C } from './theme';
import { tap } from './components';

export interface ChartPoint {
  t: number;
  v: number;
}

export function LineChart({
  points,
  color,
  height = 220,
  onScrub,
}: {
  points: ChartPoint[];
  color: string;
  height?: number;
  /** Índice del punto bajo el dedo, o null al soltar. */
  onScrub?: (i: number | null) => void;
}) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const pad = 8;

  const geo = useMemo(() => {
    if (w <= 0 || points.length < 2) return null;
    const t0 = points[0].t;
    const t1 = points[points.length - 1].t;
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of points) {
      if (p.v < lo) lo = p.v;
      if (p.v > hi) hi = p.v;
    }
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const x = (t: number) => ((t - t0) / Math.max(1, t1 - t0)) * w;
    const y = (v: number) => pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2);
    let d = '';
    points.forEach((p, i) => {
      d += `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`;
    });
    const area = `${d}L${w},${height}L0,${height}Z`;
    return { x, y, d, area };
  }, [points, w, height]);

  const pick = (px: number) => {
    if (!geo) return;
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < points.length; i++) {
      const dd = Math.abs(geo.x(points[i].t) - px);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    if (best !== sel) {
      setSel(best);
      onScrub?.(best);
    }
  };
  const release = () => {
    setSel(null);
    onScrub?.(null);
  };

  return (
    <View
      style={{ height }}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(e) => {
        tap();
        pick(e.nativeEvent.locationX);
      }}
      onResponderMove={(e) => pick(e.nativeEvent.locationX)}
      onResponderRelease={release}
      onResponderTerminate={release}
    >
      {geo ? (
        <Svg width={w} height={height}>
          <Defs>
            <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.28} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={geo.area} fill="url(#fill)" />
          <Path d={geo.d} stroke={color} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          {sel !== null && points[sel] ? (
            <>
              <Line x1={geo.x(points[sel].t)} x2={geo.x(points[sel].t)} y1={0} y2={height} stroke={C.lineStrong} strokeWidth={1} />
              <Circle cx={geo.x(points[sel].t)} cy={geo.y(points[sel].v)} r={5} fill={color} stroke={C.bg} strokeWidth={2} />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
}
