/**
 * Activos del XRP Ledger: XRP y tokens (IOU). Incluye las stablecoins con emisor oficial verificado.
 * Fuentes: docs.ripple.com (RLUSD) y developers.circle.com (USDC).
 */
import type { NetworkId } from './network';

export type Asset = { currency: 'XRP' } | { currency: string; issuer: string };

export const XRP: Asset = { currency: 'XRP' };

export interface KnownToken {
  symbol: string;
  name: string;
  currency: string; // código hex de 40 caracteres
  issuer: string;
  usdPeg: boolean;
  color: string;
}

const RLUSD_HEX = '524C555344000000000000000000000000000000';
const USDC_HEX = '5553444300000000000000000000000000000000';

export const KNOWN_TOKENS: Record<NetworkId, KnownToken[]> = {
  mainnet: [
    { symbol: 'RLUSD', name: 'Ripple USD', currency: RLUSD_HEX, issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De', usdPeg: true, color: '#7CC4FF' },
    { symbol: 'USDC', name: 'USD Coin (Circle)', currency: USDC_HEX, issuer: 'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE', usdPeg: true, color: '#4F8BFF' },
  ],
  testnet: [
    { symbol: 'RLUSD', name: 'Ripple USD', currency: RLUSD_HEX, issuer: 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV', usdPeg: true, color: '#7CC4FF' },
    { symbol: 'USDC', name: 'USD Coin (Circle)', currency: USDC_HEX, issuer: 'rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt', usdPeg: true, color: '#4F8BFF' },
  ],
};

export const isXrp = (a: Asset): a is { currency: 'XRP' } => a.currency === 'XRP';

export function sameAsset(a: Asset, b: Asset): boolean {
  if (isXrp(a) || isXrp(b)) return isXrp(a) && isXrp(b);
  return a.currency === b.currency && (a as any).issuer === (b as any).issuer;
}

export function knownToken(net: NetworkId, a: Asset): KnownToken | undefined {
  if (isXrp(a)) return undefined;
  return KNOWN_TOKENS[net].find((t) => t.currency === a.currency && t.issuer === (a as any).issuer);
}

/** Código legible: XRP, RLUSD, USDC, o el código decodificado. */
export function assetSymbol(a: Asset, net?: NetworkId): string {
  if (isXrp(a)) return 'XRP';
  if (net) {
    const k = knownToken(net, a);
    if (k) return k.symbol;
  }
  const c = a.currency;
  if (c.length === 40) {
    let s = '';
    for (let i = 0; i < 40; i += 2) {
      const code = parseInt(c.slice(i, i + 2), 16);
      if (code === 0) break;
      s += String.fromCharCode(code);
    }
    return /^[\x20-\x7E]+$/.test(s) && s ? s : c.slice(0, 6) + '…';
  }
  return c;
}

/** Normaliza un monto decimal a texto válido para un IOU (máx. 15 dígitos significativos). */
export function iouValue(n: number): string {
  if (!Number.isFinite(n) || n <= 0) throw new Error('Monto inválido');
  const s = Number(n.toPrecision(15)).toString();
  if (s.includes('e')) return Number(n.toPrecision(15)).toFixed(20).replace(/\.?0+$/, '');
  return s;
}

/** Monto en formato de transacción: drops (XRP) u objeto IOU. */
export function amountOf(a: Asset, value: number | string): string | { currency: string; issuer: string; value: string } {
  const n = typeof value === 'string' ? Number(value.replace(',', '.')) : value;
  if (!Number.isFinite(n) || n <= 0) throw new Error('Monto inválido');
  if (isXrp(a)) {
    const drops = Math.floor(n * 1_000_000 + 1e-7);
    if (drops <= 0) throw new Error('Monto demasiado pequeño');
    return String(drops);
  }
  return { currency: a.currency, issuer: (a as any).issuer, value: iouValue(n) };
}

/** Lee un monto de la red (drops u objeto) como número de unidades. */
export function readAmount(x: any): number {
  if (typeof x === 'string') return Number(x) / 1_000_000;
  return Number(x?.value ?? 0);
}

export function assetFromAmount(x: any): Asset {
  if (typeof x === 'string') return XRP;
  return { currency: x.currency, issuer: x.issuer };
}

/** Para pedir libros/AMM: forma `{currency}` o `{currency, issuer}`. */
export function bookSide(a: Asset): any {
  return isXrp(a) ? { currency: 'XRP' } : { currency: a.currency, issuer: (a as any).issuer };
}
