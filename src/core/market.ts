/**
 * Precio de XRP en la divisa elegida (solo informativo, nunca interviene en la firma).
 * Fuente: API pública de CoinGecko, con caché en memoria.
 */
import { locale } from '../i18n';
export type Fiat = 'usd' | 'eur';

export const FIATS: { value: Fiat; label: string; symbol: string; decimals: number }[] = [
  { value: 'usd', label: 'USD', symbol: 'US$', decimals: 2 },
  { value: 'eur', label: 'EUR', symbol: '€', decimals: 2 },
];

export interface PriceQuote {
  price: Record<Fiat, number>;
  change24h: Record<Fiat, number>;
  at: number;
}

let cache: PriceQuote | null = null;

export async function fetchXrpPrice(force = false): Promise<PriceQuote> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache;
  const url =
    'https://api.coingecko.com/api/v3/simple/price?ids=ripple&vs_currencies=usd,eur&include_24hr_change=true';
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Precio no disponible (${res.status})`);
  const j = (await res.json())?.ripple;
  if (!j?.usd) throw new Error('Respuesta de precio inválida');
  cache = {
    price: { usd: j.usd, eur: j.eur },
    change24h: { usd: j.usd_24h_change ?? 0, eur: j.eur_24h_change ?? 0 },
    at: Date.now(),
  };
  return cache;
}

export function formatFiat(value: number, fiat: Fiat): string {
  const f = FIATS.find((x) => x.value === fiat)!;
  const s = value.toLocaleString(locale(), { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  return `${f.symbol} ${s}`;
}

export function formatXrp(xrp: string | number, maxDecimals = 6): string {
  const n = typeof xrp === 'string' ? Number(xrp) : xrp;
  return n.toLocaleString(locale(), { minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
}

/** Convierte un monto en divisa a XRP (string con 6 decimales máx.). */
export function fiatToXrp(amount: number, fiat: Fiat, q: PriceQuote): string {
  const p = q.price[fiat];
  if (!p || p <= 0) throw new Error('Sin precio');
  const xrp = amount / p;
  return (Math.floor(xrp * 1e6) / 1e6).toFixed(6).replace(/\.?0+$/, '');
}

/** Divisa válida; si se guardó una que ya no se ofrece (p. ej. CLP), vuelve a USD. */
export function normalizeFiat(f: any): Fiat {
  return FIATS.some((x) => x.value === f) ? (f as Fiat) : 'usd';
}

// ───────────── Historial de precio ─────────────

export type Range = 'day' | 'week' | 'month' | 'year' | 'all';
export const RANGE_DAYS: Record<Range, string> = { day: '1', week: '7', month: '30', year: '365', all: 'max' };

export interface PricePoint {
  /** ms epoch */
  t: number;
  p: number;
}

const histCache = new Map<string, { at: number; pts: PricePoint[] }>();

/**
 * Precio de XRP en el tiempo (CoinGecko). `all` pide todo el historial; si la API gratuita
 * no lo permite, cae a 1 año y lo indica con `limited`.
 */
export async function fetchXrpHistory(fiat: Fiat, range: Range): Promise<{ points: PricePoint[]; limited: boolean }> {
  const key = `${fiat}:${range}`;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < (range === 'day' ? 2 : 10) * 60_000) return { points: hit.pts, limited: false };
  const get = async (days: string) => {
    const url = `https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=${fiat}&days=${days}`;
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Historial de precio no disponible (${res.status})`);
    const j: any = await res.json();
    const pts: PricePoint[] = (j?.prices ?? [])
      .filter((x: any) => Array.isArray(x) && x[1] > 0)
      .map((x: any) => ({ t: Number(x[0]), p: Number(x[1]) }));
    if (pts.length < 2) throw new Error('Historial de precio vacío');
    return pts;
  };
  let limited = false;
  let pts: PricePoint[];
  try {
    pts = await get(RANGE_DAYS[range]);
  } catch (e) {
    if (range !== 'all') throw e;
    pts = await get('365');
    limited = true;
  }
  histCache.set(key, { at: Date.now(), pts });
  return { points: pts, limited };
}
