/**
 * Historial del patrimonio: el saldo de XRP de cada cuenta en el tiempo se reconstruye
 * desde sus transacciones (cada una deja el saldo final de la cuenta en su metadata),
 * y se valoriza con el precio de XRP de cada momento. Solo lectura, nada se firma.
 */
import { getClient, NetworkId } from './network';
import { PricePoint } from './market';

/** Saldo de la cuenta (en XRP) desde el momento `t` (ms), ordenado por tiempo. */
export interface BalanceStep {
  t: number;
  xrp: number;
}

export interface BalanceHistory {
  steps: BalanceStep[];
  /** Saldo antes del primer paso conocido (0 si se llegó a la creación de la cuenta). */
  before: number;
  /** true si no se alcanzó a leer el historial completo (cuentas con muchas transacciones). */
  partial: boolean;
}

const RIPPLE_EPOCH = 946684800;

/** Extrae los cambios de saldo de `address` desde transacciones de account_tx (cualquier orden). */
export function balanceStepsFromTxs(address: string, txs: any[]): { steps: BalanceStep[]; firstPrev: number | null } {
  const rows: { t: number; seq: number; after: number; prev: number | null }[] = [];
  for (const x of txs) {
    const meta = x.meta;
    if (!meta || typeof meta !== 'object') continue;
    const tx = x.tx_json ?? x.tx ?? {};
    const t = x.close_time_iso ? Date.parse(x.close_time_iso) : tx.date ? (tx.date + RIPPLE_EPOCH) * 1000 : NaN;
    if (!Number.isFinite(t)) continue;
    for (const n of meta.AffectedNodes ?? []) {
      const node = n.ModifiedNode ?? n.CreatedNode ?? n.DeletedNode;
      if (!node || node.LedgerEntryType !== 'AccountRoot') continue;
      const f = node.FinalFields ?? node.NewFields ?? {};
      if (f.Account !== address) continue;
      let after: number;
      let prev: number | null;
      if (n.CreatedNode) {
        after = Number(f.Balance ?? 0) / 1e6;
        prev = 0;
      } else if (n.DeletedNode) {
        after = 0;
        prev = node.PreviousFields?.Balance != null ? Number(node.PreviousFields.Balance) / 1e6 : Number(f.Balance ?? 0) / 1e6;
      } else {
        if (f.Balance == null) continue;
        after = Number(f.Balance) / 1e6;
        prev = node.PreviousFields?.Balance != null ? Number(node.PreviousFields.Balance) / 1e6 : after;
      }
      rows.push({ t, seq: (x.ledger_index ?? tx.ledger_index ?? 0) * 1e5 + (meta.TransactionIndex ?? 0), after, prev });
    }
  }
  rows.sort((a, b) => a.seq - b.seq || a.t - b.t);
  return { steps: rows.map((r) => ({ t: r.t, xrp: r.after })), firstPrev: rows.length ? rows[0].prev : null };
}

/** Saldo en el instante `t` según el historial. */
export function balanceAt(h: BalanceHistory, t: number): number {
  let v = h.before;
  for (const s of h.steps) {
    if (s.t > t) break;
    v = s.xrp;
  }
  return v;
}

/**
 * Valor del patrimonio en cada punto de precio. El último punto se ajusta al saldo
 * actual (`nowXrp`) y precio actual, para que coincida con lo que muestra el inicio.
 */
export function portfolioSeries(
  histories: BalanceHistory[],
  prices: PricePoint[],
  now?: { xrp: number; price: number },
): { t: number; v: number; xrp: number }[] {
  const out = prices.map((p) => {
    const xrp = histories.reduce((s, h) => s + balanceAt(h, p.t), 0);
    return { t: p.t, v: xrp * p.p, xrp };
  });
  if (now && out.length) out.push({ t: Math.max(Date.now(), out[out.length - 1].t + 1), v: now.xrp * now.price, xrp: now.xrp });
  return out;
}

const cache = new Map<string, { at: number; h: BalanceHistory }>();

/** Lee el historial de transacciones de una cuenta (hasta `maxTx`) y arma sus saldos en el tiempo. */
export async function fetchBalanceHistory(net: NetworkId, address: string, maxTx = 2000): Promise<BalanceHistory> {
  const key = `${net}:${address}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.h;
  const client = await getClient(net);
  const txs: any[] = [];
  let marker: unknown;
  let complete = false;
  try {
    while (txs.length < maxTx) {
      const r: any = await client.request({
        command: 'account_tx',
        account: address,
        limit: 400,
        forward: false,
        api_version: 2,
        ...(marker ? { marker } : {}),
      } as any);
      txs.push(...(r.result.transactions ?? []));
      marker = r.result.marker;
      if (!marker) {
        complete = true;
        break;
      }
    }
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') {
      const h = { steps: [], before: 0, partial: false };
      cache.set(key, { at: Date.now(), h });
      return h;
    }
    throw e;
  }
  const { steps, firstPrev } = balanceStepsFromTxs(address, txs);
  const h: BalanceHistory = { steps, before: complete ? 0 : firstPrev ?? 0, partial: !complete };
  cache.set(key, { at: Date.now(), h });
  return h;
}
