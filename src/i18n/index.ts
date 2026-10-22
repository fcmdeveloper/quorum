/**
 * Idiomas de Quorum. El texto en español es la clave: `t('Enviar')` devuelve "Enviar" en
 * español y la traducción de `en.ts` en inglés (si falta, queda en español).
 * Variables: `t('Vence en {n} min', { n: 5 })`.
 */
import { EN } from './en';

export type Lang = 'es' | 'en';
export type LangSetting = 'system' | Lang;

let current: Lang = 'es';

/** Idioma del teléfono, sin módulos nativos: Hermes expone la configuración regional. */
export function systemLang(): Lang {
  try {
    const loc = Intl.DateTimeFormat().resolvedOptions().locale || '';
    return loc.toLowerCase().startsWith('es') ? 'es' : 'en';
  } catch {
    return 'es';
  }
}

export function setLang(l: Lang) {
  current = l;
}
export function lang(): Lang {
  return current;
}
/** Configuración regional para números y fechas. */
export function locale(): string {
  return current === 'en' ? 'en-US' : 'es-CL';
}

/**
 * Palabras que cambian según el teléfono (p. ej. "Face ID" en iPhone, "la huella" en Android).
 * Se configura una vez al iniciar la app (App.tsx); sin configurar, los textos quedan tal cual.
 * `exact`: cuando el texto completo es la palabra (un botón o una etiqueta); `inline`: dentro de una frase.
 */
type Swap = { from: string; exact: string; inline: string };
let swaps: Record<Lang, Swap[]> = { es: [], en: [] };
export function setDeviceWords(w: Record<Lang, Swap[]>) {
  swaps = w;
}
function swap(s: string): string {
  const list = swaps[current];
  if (!list.length) return s;
  for (const w of list) {
    if (s === w.from) return w.exact;
    if (s.includes(w.from)) s = s.split(w.from).join(w.inline);
  }
  return s;
}

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = swap(current === 'en' ? (EN[s] ?? s) : s);
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/**
 * Traduce lo que se va a mostrar: un texto, o las partes de texto de un contenido mixto
 * (p. ej. ["Vence en ~", 5, " min"]). Se conservan los espacios de los extremos.
 */
export function tr<N>(node: N): N {
  if (current === 'es' && !swaps.es.length) return node;
  const one = (x: unknown): unknown => {
    if (typeof x !== 'string') return x;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(x)!;
    if (!m[2]) return x;
    const hit = current === 'en' ? EN[m[2]] : undefined;
    return m[1] + swap(hit === undefined ? m[2] : hit) + m[3];
  };
  if (Array.isArray(node)) return node.map(one) as unknown as N;
  return one(node) as N;
}
