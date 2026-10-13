/**
 * Quorum — sistema visual.
 * Negro OLED real como base; verde "vault" para lo seguro y lo positivo.
 * El verde se usa con disciplina: estados seguros, acciones principales y el anillo de quórum.
 */
const DARK = {
  bg: '#000000',
  surface: '#0A100D',
  surface2: '#101914',
  raised: '#16221C',
  line: '#1D2B24',
  lineStrong: '#2A3D33',
  text: '#ECF5F0',
  dim: '#8FA39A',
  faint: '#56685F',
  green: '#3CF29C',
  greenDeep: '#10B26A',
  greenInk: '#00140A',
  greenGlow: 'rgba(60,242,156,0.14)',
  warn: '#F5B947',
  warnBg: 'rgba(245,185,71,0.12)',
  bad: '#FF6464',
  badBg: 'rgba(255,100,100,0.12)',
  test: '#7CC4FF',
};

/** Modo claro: el verde se oscurece para leerse bien sobre blanco. */
const LIGHT: typeof DARK = {
  bg: '#F3F6F4',
  surface: '#FFFFFF',
  surface2: '#EDF2EF',
  raised: '#E2EBE6',
  line: '#DAE3DE',
  lineStrong: '#BFCEC6',
  text: '#0C1A13',
  dim: '#4F6359',
  faint: '#87988F',
  green: '#0B8F55',
  greenDeep: '#0B8F55',
  greenInk: '#FFFFFF',
  greenGlow: 'rgba(11,143,85,0.10)',
  warn: '#A86A12',
  warnBg: 'rgba(168,106,18,0.12)',
  bad: '#D23F3F',
  badBg: 'rgba(210,63,63,0.10)',
  test: '#2470B3',
};

export type ThemeName = 'dark' | 'light';
export type Appearance = 'system' | ThemeName;

/**
 * Paleta activa. Es un objeto que se actualiza en el lugar al cambiar de tema, así que
 * los componentes leen `C.x` al dibujar y toman el color nuevo al volver a montarse.
 */
export const C = { ...DARK };
let currentTheme: ThemeName = 'dark';
const themeListeners = new Set<() => void>();

export function themeName(): ThemeName {
  return currentTheme;
}

export function applyTheme(name: ThemeName) {
  if (name === currentTheme) return;
  currentTheme = name;
  Object.assign(C, name === 'light' ? LIGHT : DARK);
  buildT();
  themeListeners.forEach((f) => f());
}

/** Para estilos calculados una vez (StyleSheet): se reconstruyen al cambiar de tema. */
export function onThemeChange(f: () => void) {
  themeListeners.add(f);
  return () => themeListeners.delete(f);
}

/** Colores que el usuario puede asignar a cada cuenta (para reconocerlas de un vistazo). */
export const ACCOUNT_COLORS: { key: string; color: string; name: string }[] = [
  { key: 'green', color: '#3CF29C', name: 'Verde' },
  { key: 'cyan', color: '#4FD8E8', name: 'Cian' },
  { key: 'blue', color: '#6EA8FF', name: 'Azul' },
  { key: 'violet', color: '#A98BFF', name: 'Violeta' },
  { key: 'pink', color: '#FF7EC8', name: 'Rosa' },
  { key: 'red', color: '#FF6E6E', name: 'Rojo' },
  { key: 'orange', color: '#FF9F4A', name: 'Naranja' },
  { key: 'yellow', color: '#F5D547', name: 'Amarillo' },
  { key: 'gray', color: '#A6B3AD', name: 'Gris' },
];

export function accountColor(key?: string): string {
  return ACCOUNT_COLORS.find((c) => c.key === key)?.color ?? ACCOUNT_COLORS[0].color;
}

/** Color con transparencia (hex #RRGGBB + alfa 0–1). */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export const F = {
  regular: 'SpaceGrotesk_400Regular',
  medium: 'SpaceGrotesk_500Medium',
  semibold: 'SpaceGrotesk_600SemiBold',
  bold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
};

export const R = { sm: 10, md: 16, lg: 24, pill: 999 };
export const SP = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Escala tipográfica (razón ~1.25). */
type TextStyleT = { fontFamily: string; fontSize: number; letterSpacing?: number; lineHeight?: number; color: string };
export const T = {} as Record<'hero' | 'h1' | 'h2' | 'h3' | 'body' | 'small' | 'label' | 'mono', TextStyleT>;
function buildT() {
  Object.assign(T, {
    hero: { fontFamily: F.bold, fontSize: 40, letterSpacing: -1.2, color: C.text },
    h1: { fontFamily: F.bold, fontSize: 28, letterSpacing: -0.6, color: C.text },
    h2: { fontFamily: F.semibold, fontSize: 20, letterSpacing: -0.3, color: C.text },
    h3: { fontFamily: F.semibold, fontSize: 16, color: C.text },
    body: { fontFamily: F.regular, fontSize: 15, lineHeight: 21, color: C.text },
    small: { fontFamily: F.regular, fontSize: 13, lineHeight: 18, color: C.dim },
    label: { fontFamily: F.medium, fontSize: 13, color: C.dim },
    mono: { fontFamily: F.mono, fontSize: 12.5, color: C.text },
  });
}
buildT();
