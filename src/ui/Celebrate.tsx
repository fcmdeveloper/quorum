/**
 * Celebración al crear o agregar una bóveda o cuenta: la bóveda se transforma en la X con una
 * explosión de chispas y un texto. Va encima de todo, no bloquea toques y se va sola.
 *
 *   celebrate('Bóveda creada')
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { t } from '../i18n';
import { Txt, success } from './components';
import { C } from './theme';
import { QuorumMorph, QuorumMorphHandle } from './QuorumMorph';

let show: ((text: string) => void) | null = null;

export function celebrate(text: string) {
  show?.(text);
}

export function CelebrateHost() {
  const [text, setText] = useState<string | null>(null);
  const [n, setN] = useState(0);
  const morph = useRef<QuorumMorphHandle>(null);
  const bg = useRef(new Animated.Value(0)).current;
  const label = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    show = (x) => {
      setText(x);
      setN((v) => v + 1);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!text) return;
    let alive = true;
    bg.setValue(0);
    label.setValue(0);
    Animated.timing(bg, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    // la vibración coincide con la explosión
    const hz = setTimeout(success, 950);
    const lt = setTimeout(() => Animated.timing(label, { toValue: 1, duration: 320, useNativeDriver: true }).start(), 1050);
    requestAnimationFrame(() => {
      morph.current?.reset();
      morph.current
        ?.success()
        .then(() => new Promise((r) => setTimeout(r, 700)))
        .then(() => {
          if (!alive) return;
          Animated.timing(bg, { toValue: 0, duration: 280, useNativeDriver: true }).start(() => alive && setText(null));
        });
    });
    return () => {
      alive = false;
      clearTimeout(hz);
      clearTimeout(lt);
    };
  }, [n]);

  if (!text) return null;
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg + 'F2', alignItems: 'center', justifyContent: 'center', gap: 22, opacity: bg }]}>
      <QuorumMorph ref={morph} size={120} />
      <Animated.View style={{ opacity: label, transform: [{ translateY: label.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }}>
        <Txt v="h2">{t(text)}</Txt>
      </Animated.View>
    </Animated.View>
  );
}
