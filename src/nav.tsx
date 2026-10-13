import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, BackHandler, Dimensions, Easing, PanResponder } from 'react-native';
import { themeName } from './ui/theme';

export type Route =
  | { name: 'account'; params: { id: string } }
  | { name: 'send'; params: { id: string; to?: string; tag?: string; asset?: string } }
  | { name: 'receive'; params: { id: string } }
  | { name: 'nfts'; params: { id: string } }
  | { name: 'swap'; params: { id: string } }
  | { name: 'trade'; params: { id: string } }
  | { name: 'security'; params: { id: string } }
  | { name: 'vaultWizard'; params: { id?: string } }
  | { name: 'addAccount'; params: {} }
  | { name: 'devices'; params: {} }
  | { name: 'addDevice'; params: { kind: 'tangem' | 'ledger' | 'xaman' } }
  | { name: 'proposal'; params: { id: string } }
  | { name: 'showQr'; params: { id: string } }
  | { name: 'scan'; params: { purpose: 'any' | 'address'; onAddress?: (a: string, tag?: string) => void } }
  | { name: 'contacts'; params: {} }
  | { name: 'about'; params: {} }
  | { name: 'donate'; params: {} }
  | { name: 'guide'; params: {} }
  | { name: 'unvault'; params: { id: string } }
  | { name: 'finishVault'; params: { id: string } }
  | { name: 'backup'; params: {} }
  | { name: 'reorder'; params: { kind: 'vault' | 'wallet' } }
  | { name: 'charts'; params: { view: 'portfolio' | 'market' } };

export type Tab = 'home' | 'activity' | 'proposals' | 'settings';

interface NavCtx {
  tab: Tab;
  setTab: (t: Tab) => void;
  stack: Route[];
  push: <R extends Route>(name: R['name'], params: R['params']) => void;
  replace: <R extends Route>(name: R['name'], params: R['params']) => void;
  pop: () => void;
  popToRoot: () => void;
}

const Ctx = createContext<NavCtx | null>(null);
export const useNav = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNav fuera de NavProvider');
  return v;
};

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTab] = useState<Tab>('home');
  const [stack, setStack] = useState<Route[]>([]);
  const stackRef = useRef<Route[]>([]);
  stackRef.current = stack;

  const push = useCallback((name: any, params: any) => setStack((s) => [...s, { name, params } as Route]), []);
  const replace = useCallback(
    (name: any, params: any) => setStack((s) => [...s.slice(0, -1), { name, params } as Route]),
    [],
  );
  const pop = useCallback(() => setStack((s) => s.slice(0, -1)), []);
  const popToRoot = useCallback(() => setStack([]), []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (stackRef.current.length) {
        pop();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [pop]);

  const value = useMemo(() => ({ tab, setTab, stack, push, replace, pop, popToRoot }), [tab, stack]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Pantalla apilada: entra deslizándose y se puede cerrar arrastrando desde el borde
 * izquierdo hacia la derecha (como en iOS). Al volver, la anterior entra desde la izquierda.
 */
export function SlideIn({ children, k, depth, onBack }: { children: React.ReactNode; k: string; depth: number; onBack: () => void }) {
  const W = Dimensions.get('window').width;
  const x = useRef(new Animated.Value(W * 0.25)).current;
  const o = useRef(new Animated.Value(0)).current;
  const prevDepth = useRef(depth);
  const swiped = useRef(false);
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    const goingBack = depth < prevDepth.current;
    prevDepth.current = depth;
    if (swiped.current) {
      // venimos de un gesto: la pantalla anterior aparece sin otra animación lateral
      swiped.current = false;
      x.setValue(-W * 0.08);
      o.setValue(0.6);
    } else {
      x.setValue(goingBack ? -W * 0.25 : W * 0.25);
      o.setValue(0);
    }
    Animated.parallel([
      Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(o, { toValue: 1, duration: 180, useNativeDriver: true }),
    ]).start();
  }, [k]);

  const pan = useRef(
    PanResponder.create({
      // solo si el gesto parte del borde izquierdo y es claramente horizontal
      onMoveShouldSetPanResponderCapture: (_e, g) => g.x0 < 28 && g.dx > 8 && Math.abs(g.dy) < g.dx * 0.7,
      onPanResponderMove: (_e, g) => {
        x.setValue(Math.max(0, g.dx));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dx > W * 0.33 || g.vx > 0.6) {
          Animated.timing(x, { toValue: W, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(() => {
            swiped.current = true;
            onBackRef.current();
          });
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
      },
    }),
  ).current;

  return (
    <Animated.View style={{ flex: 1, backgroundColor: themeName() === 'light' ? '#C9D3CE' : '#000', overflow: 'hidden' }}>
      <Animated.View
        {...pan.panHandlers}
        style={{
          flex: 1,
          opacity: o,
          transform: [{ translateX: x }],
          shadowColor: '#000',
          shadowOpacity: 0.35,
          shadowRadius: 12,
          shadowOffset: { width: -4, height: 0 },
        }}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}
