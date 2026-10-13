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

export function t(s: string, vars?: Record<string, string | number>): string {
  let out = current === 'en' ? EN[s] ?? s : s;
  if (vars) for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(String(v));
  return out;
}

/**
 * Traduce lo que se va a mostrar: un texto, o las partes de texto de un contenido mixto
 * (p. ej. ["Vence en ~", 5, " min"]). Se conservan los espacios de los extremos.
 */
export function tr<N>(node: N): N {
  if (current === 'es') return node;
  const one = (x: unknown): unknown => {
    if (typeof x !== 'string') return x;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(x)!;
    if (!m[2]) return x;
    const hit = EN[m[2]];
    return hit === undefined ? x : m[1] + hit + m[3];
  };
  if (Array.isArray(node)) return node.map(one) as unknown as N;
  return one(node) as N;
}

