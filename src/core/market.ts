/**
 * Precio de XRP en la divisa elegida (solo informativo, nunca interviene en la firma).
 * Fuente: API pública de CoinGecko, con caché en memoria.
 */
import { locale, t } from '../i18n';
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
  if (!res.ok) throw new Error(t('Precio no disponible ({n})', { n: res.status }));
  const j = (await res.json())?.ripple;
  if (!j?.usd) throw new Error('Respuesta de precio inválida');
  cache = {
    price: { usd: j.usd, eur: j.eur },
    change24h: { usd: j.usd_24h_change ?? 0, eur: j.eur_24h_change ?? 0 },
    at: Date.now(),
  };
  return cache;
}

export function formatFiat(value: number, fiat: Fiat, decimals?: number): string {
  const f = FIATS.find((x) => x.value === fiat)!;
  const d = decimals ?? f.decimals;
  const s = value.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  return `${f.symbol} ${s}`;
}

/** Saldo con decimales fijos ('auto' = como siempre: hasta 6 para XRP). */
export function formatBalanceXrp(xrp: string | number, pref: 'auto' | '0' | '2' | '4' | '6' = 'auto'): string {
  if (pref === 'auto') return formatXrp(xrp);
  const d = Number(pref);
  const n = typeof xrp === 'string' ? Number(xrp) : xrp;
  // se trunca (no se redondea hacia arriba): nunca mostrar más saldo del que hay
  const k = 10 ** d;
  return (Math.floor(n * k + 1e-7) / k).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
}

/** Decimales de divisa para saldos: 0 si se eligió 0; si no, los de la divisa (2). */
export function balanceFiatDecimals(pref: 'auto' | '0' | '2' | '4' | '6' = 'auto'): number | undefined {
  return pref === '0' ? 0 : undefined;
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

const histCache = new Map<string, { at: number; pts: PricePoint[]; limited: boolean }>();

/** fetch con tiempo límite (las APIs gratuitas a veces no responden). */
async function getJson(url: string, ms = 12_000): Promise<any> {
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: { accept: 'application/json' }, signal: ctl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(to);
  }
}

/** CoinGecko: buena cobertura (desde 2013), pero con límite de consultas bajo en su plan gratuito. */
async function fromCoinGecko(fiat: Fiat, days: string): Promise<PricePoint[]> {
  const j = await getJson(`https://api.coingecko.com/api/v3/coins/ripple/market_chart?vs_currency=${fiat}&days=${days}`);
  return (j?.prices ?? [])
    .filter((x: any) => Array.isArray(x) && x[1] > 0)
    .map((x: any) => ({ t: Number(x[0]), p: Number(x[1]) }));
}

/** Kraken: velas públicas (máx. 720 por consulta). Respaldo cuando CoinGecko limita o falla. */
const KRAKEN_INTERVAL: Record<Range, number> = { day: 5, week: 15, month: 60, year: 1440, all: 10080 };
const RANGE_MS: Record<Range, number> = { day: 864e5, week: 7 * 864e5, month: 30 * 864e5, year: 365 * 864e5, all: 0 };
async function fromKraken(fiat: Fiat, range: Range): Promise<PricePoint[]> {
  const interval = KRAKEN_INTERVAL[range];
  const since = range === 'all' ? 0 : Math.floor((Date.now() - RANGE_MS[range]) / 1000);
  const j = await getJson(`https://api.kraken.com/0/public/OHLC?pair=XRP${fiat.toUpperCase()}&interval=${interval}${since ? `&since=${since}` : ''}`);
  if (j?.error?.length) throw new Error(String(j.error[0]));
  const key = Object.keys(j?.result ?? {}).find((k) => k !== 'last');
  const rows: any[] = key ? j.result[key] : [];
  return rows.map((r) => ({ t: Number(r[0]) * 1000, p: Number(r[4]) })).filter((x) => x.p > 0);
}

/**
 * Precio de XRP en el tiempo. Primero CoinGecko; si falla o limita, Kraken.
 * `limited`: en "Todo", el historial disponible no llega al inicio de XRP.
 */
export async function fetchXrpHistory(fiat: Fiat, range: Range): Promise<{ points: PricePoint[]; limited: boolean }> {
  const key = `${fiat}:${range}`;
  const hit = histCache.get(key);
  if (hit && Date.now() - hit.at < (range === 'day' ? 2 : 10) * 60_000) return { points: hit.pts, limited: hit.limited };
  const tries: (() => Promise<{ pts: PricePoint[]; limited: boolean }>)[] = [
    async () => ({ pts: await fromCoinGecko(fiat, RANGE_DAYS[range]), limited: false }),
    async () => ({ pts: await fromKraken(fiat, range), limited: range === 'all' }),
  ];
  if (range === 'all') tries.splice(1, 0, async () => ({ pts: await fromCoinGecko(fiat, '365'), limited: true }));
  let lastErr: unknown;
  for (const run of tries) {
    try {
      const r = await run();
      if (r.pts.length >= 2) {
        r.pts.sort((a, b) => a.t - b.t);
        histCache.set(key, { at: Date.now(), ...r });
        return { points: r.pts, limited: r.limited };
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // sin red: mejor mostrar lo último que se tuvo que nada
  if (hit) return { points: hit.pts, limited: hit.limited };
  throw new Error(t('Historial de precio no disponible') + (lastErr ? ` (${(lastErr as any)?.message ?? lastErr})` : ''));
}
