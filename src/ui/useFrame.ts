/**
 * Lee Animated.Value en cada cuadro y vuelve a dibujar el componente. Sirve para animar formas
 * DENTRO de un SVG (react-native-svg redibuja el vector): queda nítido a cualquier escala, a
 * diferencia de animar la vista entera, que iOS mueve como una imagen y se pixela al agrandarse.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';

export function useFrameValues(values: Animated.Value[]): number[] {
  const cur = useRef(values.map((v) => (v as any).__getValue?.() ?? 0));
  const [, setTick] = useState(0);
  useEffect(() => {
    let raf: number | null = null;
    const ids = values.map((v, i) =>
      v.addListener(({ value }) => {
        cur.current[i] = value;
        if (raf === null)
          raf = requestAnimationFrame(() => {
            raf = null;
            setTick((n) => (n + 1) % 1e9);
          });
      }),
    );
    return () => {
      ids.forEach((id, i) => values[i].removeListener(id));
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);
  return cur.current;
}
