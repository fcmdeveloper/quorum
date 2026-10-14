/**
 * Liquid Glass de iOS 26 (expo-glass-effect). Se usa solo en lo que flota sobre el
 * contenido (barra de pestañas, botón de escanear, avisos), que es donde el vidrio se ve.
 * En iOS anteriores y en Android dibuja una vista normal con el fondo de siempre.
 */
import React from 'react';
import { Platform, StyleProp, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { C, themeName } from './theme';

let available: boolean | null = null;
/** true si este iPhone dibuja Liquid Glass (iOS 26 o superior). */
export function hasGlass(): boolean {
  if (available === null) {
    try {
      available = Platform.OS === 'ios' && isLiquidGlassAvailable();
    } catch {
      available = false;
    }
  }
  return available;
}

let nativeSelectors = false;
/** Lo fija la app según Ajustes; solo tiene efecto si hay Liquid Glass. */
export function setNativeSelectors(on: boolean) {
  nativeSelectors = on;
}
export function useNativeSelectors(): boolean {
  return nativeSelectors && hasGlass();
}

export function Glass({
  style,
  tint,
  interactive,
  clear,
  fallback,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  /** Color que tiñe el vidrio (p. ej. el verde de Quorum en el botón de escanear). */
  tint?: string;
  /** Reacciona al toque (se deforma y brilla), para botones. */
  interactive?: boolean;
  /** Vidrio más transparente. */
  clear?: boolean;
  /** Estilo cuando no hay Liquid Glass (fondo, borde). */
  fallback?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  if (hasGlass()) {
    return (
      <GlassView
        style={style}
        glassEffectStyle={clear ? 'clear' : 'regular'}
        tintColor={tint}
        isInteractive={interactive}
        colorScheme={themeName()}
      >
        {children}
      </GlassView>
    );
  }
  return <View style={[{ backgroundColor: C.surface }, style, fallback]}>{children}</View>;
}
