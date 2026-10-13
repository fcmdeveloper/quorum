/**
 * Lecturas del DEX del XRP Ledger: libro de órdenes, pools AMM, cotización de swaps y órdenes abiertas.
 */
import { getClient, NetworkId } from './network';
import { Asset, assetFromAmount, bookSide, readAmount } from './assets';

export interface BookLevel {
  price: number; // quote por 1 base
  amount: number; // en base
  total: number; // en quote
}

/** Ofertas que ENTREGAN `gets` a cambio de `pays` (vista del que toma). */
async function rawBook(net: NetworkId, gets: Asset, pays: Asset, limit = 30): Promise<{ gets: number; pays: number }[]> {
  const c = await getClient(net);
  const r: any = await c.request({
    command: 'book_offers',
    taker_gets: bookSide(gets),
    taker_pays: bookSide(pays),
    limit,
  } as any);
  return (r.result.offers ?? [])
    .map((o: any) => ({
      gets: readAmount(o.taker_gets_funded ?? o.TakerGets),
      pays: readAmount(o.taker_pays_funded ?? o.TakerPays),
    }))
    .filter((o: any) => o.gets > 0 && o.pays > 0);
}

/** Libro para el par base/quote: asks (venden base) ordenados de menor a mayor precio, bids de mayor a menor. */
export async function fetchOrderBook(net: NetworkId, base: Asset, quote: Asset, depth = 8): Promise<{ asks: BookLevel[]; bids: BookLevel[] }> {
  const [asksRaw, bidsRaw] = await Promise.all([rawBook(net, base, quote), rawBook(net, quote, base)]);
  const asks = asksRaw.map((o) => ({ price: o.pays / o.gets, amount: o.gets, total: o.pays })).slice(0, depth);
  const bids = bidsRaw.map((o) => ({ price: o.gets / o.pays, amount: o.pays, total: o.gets })).slice(0, depth);
  return { asks, bids };
}

export interface AmmPool {
  amountA: number; // del activo `a`
  amountB: number; // del activo `b`
  fee: number; // fracción (0.003 = 0,3 %)
}

export async function fetchAmm(net: NetworkId, a: Asset, b: Asset): Promise<AmmPool | null> {
  const c = await getClient(net);
  try {
    const r: any = await c.request({ command: 'amm_info', asset: bookSide(a), asset2: bookSide(b) } as any);
    const amm = r.result.amm;
    const first = assetFromAmount(amm.amount);
    const aFirst = first.currency === a.currency && (first as any).issuer === (a as any).issuer;
    const x = readAmount(amm.amount);
    const y = readAmount(amm.amount2);
    return { amountA: aFirst ? x : y, amountB: aFirst ? y : x, fee: (amm.trading_fee ?? 0) / 100000 };
  } catch {
    return null;
  }
}

/** Producto constante con comisión. Puro, testeable. */
export function ammOut(pool: AmmPool, amountIn: number): number {
  const inEff = amountIn * (1 - pool.fee);
  return (pool.amountB * inEff) / (pool.amountA + inEff);
}

/** Recorre el libro (ofertas que entregan `to` por `from`) consumiendo `amountIn`. Puro, testeable. */
export function bookOut(offers: { gets: number; pays: number }[], amountIn: number): { out: number; filled: number } {
  let left = amountIn;
  let out = 0;
  for (const o of offers) {
    if (left <= 0) break;
    const take = Math.min(left, o.pays);
    out += (take / o.pays) * o.gets;
    left -= take;
  }
  return { out, filled: amountIn - left };
}

export interface SwapQuote {
  out: number;
  rate: number; // to por 1 from
  source: 'amm' | 'libro' | 'mixto';
  priceImpact: number; // fracción
}

/**
 * Estimación del resultado de vender `amountIn` de `from` por `to`.
 * El ledger ejecuta contra el libro y el AMM a la vez; aquí se estima con la mejor de ambas
 * fuentes y la ejecución real exige un mínimo (deslizamiento), así que nunca recibes menos.
 */
export async function quoteSwap(net: NetworkId, from: Asset, to: Asset, amountIn: number): Promise<SwapQuote | null> {
  if (!(amountIn > 0)) return null;
  const [offers, pool] = await Promise.all([rawBook(net, to, from, 60).catch(() => []), fetchAmm(net, from, to)]);
  const book = bookOut(offers, amountIn);
  const ammRes = pool ? ammOut(pool, amountIn) : 0;
  const bookFull = book.filled >= amountIn * 0.999 ? book.out : 0;
  const out = Math.max(bookFull, ammRes);
  if (!(out > 0)) return null;
  const spot = pool ? pool.amountB / pool.amountA : offers[0] ? offers[0].gets / offers[0].pays : out / amountIn;
  const rate = out / amountIn;
  return {
    out,
    rate,
    source: bookFull && ammRes ? (bookFull >= ammRes ? 'libro' : 'amm') : bookFull ? 'libro' : 'amm',
    priceImpact: Math.max(0, 1 - rate / spot),
  };
}

export interface OpenOffer {
  seq: number;
  gets: { asset: Asset; amount: number };
  pays: { asset: Asset; amount: number };
}

export async function fetchOpenOffers(net: NetworkId, account: string): Promise<OpenOffer[]> {
  const c = await getClient(net);
  try {
    const r: any = await c.request({ command: 'account_offers', account, ledger_index: 'validated' } as any);
    return (r.result.offers ?? []).map((o: any) => ({
      seq: o.seq,
      gets: { asset: assetFromAmount(o.taker_gets), amount: readAmount(o.taker_gets) },
      pays: { asset: assetFromAmount(o.taker_pays), amount: readAmount(o.taker_pays) },
    }));
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return [];
    throw e;
  }
}

/** Comisión de transferencia del emisor (1 = sin comisión). */
export async function fetchTransferRate(net: NetworkId, issuer: string): Promise<number> {
  const c = await getClient(net);
  try {
    const r: any = await c.request({ command: 'account_info', account: issuer, ledger_index: 'validated' } as any);
    const tr = r.result.account_data.TransferRate;
    return tr ? tr / 1_000_000_000 : 1;
  } catch {
    return 1;
  }
}
