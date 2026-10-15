/**
 * Actividad de varias cuentas, paginada contra el XRP Ledger. Lógica pura (sin red ni React).
 *
 * Cada cuenta se pide por páginas, de la más nueva a la más antigua. Al juntar varias cuentas
 * hay que tener cuidado: si a la cuenta A le quedan páginas por pedir, no se puede mostrar nada
 * más antiguo que su último movimiento cargado, porque en ese hueco podría faltar algo de A.
 * Ese límite es la "frontera".
 */
import type { ActivityItem } from './network';

export type Period = '7d' | '30d' | 'year' | 'all';

export interface FeedSource<T extends ActivityItem = ActivityItem> {
  key: string;
  items: T[];
  /** Marcador del ledger para la página siguiente. */
  marker?: unknown;
  /** Ya no hay más páginas (o falló y se deja de pedir). */
  done: boolean;
}

/** Inicio del período (ms) o null si es todo. */
export function periodStart(p: Period, now: number): number | null {
  const day = 24 * 60 * 60 * 1000;
  if (p === '7d') return now - 7 * day;
  if (p === '30d') return now - 30 * day;
  if (p === 'year') return new Date(new Date(now).getFullYear(), 0, 1).getTime();
  return null;
}

const oldest = (s: FeedSource) => (s.items.length ? Math.min(...s.items.map((i) => i.date)) : Infinity);

/** Fecha más antigua que se puede mostrar sin huecos (-Infinity si ya está todo cargado). */
export function frontier(sources: FeedSource[]): number {
  let f = -Infinity;
  for (const s of sources) if (!s.done) f = Math.max(f, oldest(s));
  return f;
}

/** Lista para mostrar: sin duplicados (un pago entre cuentas propias aparece una vez), ordenada, sin huecos y dentro del período. */
export function mergeFeed<T extends ActivityItem>(sources: FeedSource<T>[], from: number | null): T[] {
  const f = frontier(sources);
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of sources.flatMap((s) => s.items).sort((a, b) => b.date - a.date)) {
    if (it.date < f) continue;
    if (from !== null && it.date < from) continue;
    if (seen.has(it.hash)) continue;
    seen.add(it.hash);
    out.push(it);
  }
  return out;
}

/** Cuentas a las que hay que pedirles otra página para cubrir el período (o para "cargar más"). */
export function sourcesToLoad(sources: FeedSource[], from: number | null): FeedSource[] {
  const pending = sources.filter((s) => !s.done);
  if (!pending.length) return [];
  if (from === null) {
    // "Cargar más": solo las que marcan la frontera, para avanzar de a poco y sin huecos
    const f = frontier(sources);
    return pending.filter((s) => oldest(s) === f);
  }
  return pending.filter((s) => oldest(s) >= from);
}

/** ¿Queda historia por cargar en este período? */
export function hasMore(sources: FeedSource[], from: number | null): boolean {
  return sourcesToLoad(sources, from).length > 0;
}
