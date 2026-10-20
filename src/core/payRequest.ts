/**
 * Pedido de pago: "págame 25 XRP a esta dirección", compartido por enlace o QR, sin servidor.
 *
 * El enlace usa la misma página que las operaciones compartidas, con los datos DESPUÉS del `#`
 * (el navegador no los envía al servidor):
 *   https://quorumxrpl.com/p#pay=rDEST…&a=25&t=123&n=Almuerzo&f=Alex&net=t
 * En Quorum abre una pantalla para elegir desde qué cuenta pagar; luego se revisa y firma en Enviar
 * (con todos sus avisos: destino nuevo, direcciones parecidas, saldo).
 *
 * También se leen los formatos comunes de otras billeteras: una dirección sola, `xrpl:r…?amount=…&dt=…`
 * o `r…?amount=…`. El nombre y el motivo los escribe quien pide y NO están verificados.
 */
import { isValidClassicAddress } from 'ripple-address-codec';
import { cleanText, MAX_FROM, MAX_NOTE } from './share';
import type { NetworkId } from './network';

export interface PayRequest {
  /** Dirección que recibe. */
  to: string;
  network: NetworkId;
  /** Monto en XRP como texto decimal (punto), p. ej. "25" o "0.5". Sin monto: lo escribe quien paga. */
  amount?: string;
  /** Destination tag. */
  tag?: string;
  /** Motivo (lo escribe quien pide; no verificado). */
  note?: string;
  /** Quién pide (lo escribe esa persona; no verificado). */
  from?: string;
}

const MAX_XRP = 100_000_000_000; // suministro total: nada razonable lo supera

/** Monto válido en XRP: positivo, hasta 6 decimales. Devuelve el texto normalizado o null. */
export function normalizeXrpAmount(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim().replace(',', '.');
  if (!/^\d+(\.\d{1,6})?$/.test(s)) return null;
  const n = Number(s);
  if (!(n > 0) || n > MAX_XRP) return null;
  // sin ceros sobrantes: "25.50" → "25.5", "007" → "7"
  return trimNumber(s);
}

function trimNumber(s: string): string {
  let [i, d = ''] = s.split('.');
  i = i.replace(/^0+(?=\d)/, '');
  d = d.replace(/0+$/, '');
  return d ? `${i}.${d}` : i;
}

/** Destination tag válido (entero de 32 bits sin signo) o null. */
export function normalizeTag(v: string | undefined | null): string | null {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{1,10}$/.test(s)) return null;
  return Number(s) <= 4294967295 ? String(Number(s)) : null;
}

/** Fragmento del enlace (lo que va tras el `#`). */
export function payFragment(r: PayRequest): string {
  const parts = [`pay=${r.to}`];
  const amount = normalizeXrpAmount(r.amount);
  const tag = normalizeTag(r.tag);
  const note = cleanText(r.note, MAX_NOTE);
  const from = cleanText(r.from, MAX_FROM);
  if (amount) parts.push(`a=${amount}`);
  if (tag) parts.push(`t=${tag}`);
  if (note) parts.push(`n=${encodeURIComponent(note)}`);
  if (from) parts.push(`f=${encodeURIComponent(from)}`);
  if (r.network === 'testnet') parts.push('net=t');
  return parts.join('&');
}

/** Enlace web que abre el pedido en Quorum. */
export function payLink(website: string, r: PayRequest): string {
  return `${website.replace(/\/+$/, '')}/p#${payFragment(r)}`;
}

function params(q: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const kv of q.split('&')) {
    const i = kv.indexOf('=');
    if (i <= 0) continue;
    try {
      m.set(kv.slice(0, i).toLowerCase(), decodeURIComponent(kv.slice(i + 1).replace(/\+/g, ' ')));
    } catch {}
  }
  return m;
}

function build(to: string, p: Map<string, string>, network: NetworkId): PayRequest | null {
  if (!isValidClassicAddress(to)) return null;
  const rawAmount = p.get('a') ?? p.get('amount');
  const amount = normalizeXrpAmount(rawAmount);
  if (rawAmount !== undefined && rawAmount !== '' && !amount) return null; // un monto ilegible no se adivina
  const rawTag = p.get('t') ?? p.get('dt') ?? p.get('tag') ?? p.get('destinationtag');
  const tag = normalizeTag(rawTag);
  if (rawTag !== undefined && rawTag !== '' && !tag) return null;
  const r: PayRequest = { to, network };
  if (amount) r.amount = amount;
  if (tag) r.tag = tag;
  const note = cleanText(p.get('n'), MAX_NOTE);
  const from = cleanText(p.get('f'), MAX_FROM);
  if (note) r.note = note;
  if (from) r.from = from;
  return r;
}

/**
 * Lee un pedido de pago desde un enlace de Quorum (https://…/p#pay=…, quorum://p#pay=…), desde un
 * texto que lo contiene, o desde `xrpl:r…?amount=…` / `r…?amount=…`. null si no hay.
 * Una dirección sola NO es un pedido (eso lo maneja el escáner de direcciones).
 */
export function parsePayRequest(text: string | null | undefined): PayRequest | null {
  if (!text) return null;
  const raw = text.trim();
  const ours = /(?:https?:\/\/[^\s#]+\/p\/?|quorum:\/\/p\/?)#(pay=[^\s]+)/i.exec(raw);
  if (ours) {
    const p = params(ours[1]);
    return build(p.get('pay') ?? '', p, p.get('net') === 't' ? 'testnet' : 'mainnet');
  }
  const generic = /(?:xrpl:|ripple:)?(r[1-9A-HJ-NP-Za-km-z]{24,34})\?([^\s#]+)/.exec(raw);
  if (generic) {
    const p = params(generic[2]);
    if (!p.has('amount') && !p.has('a')) return null;
    return build(generic[1], p, p.get('network') === 'testnet' ? 'testnet' : 'mainnet');
  }
  return null;
}

/** Mensaje listo para compartir. `tr` traduce los textos fijos (español es la clave). */
export function payMessage(r: PayRequest, link: string, tr: (k: string, v?: Record<string, string | number>) => string): string {
  const from = cleanText(r.from, MAX_FROM);
  const note = cleanText(r.note, MAX_NOTE);
  const amount = normalizeXrpAmount(r.amount);
  const lines = [
    amount
      ? from
        ? tr('{x} te pide {a} XRP', { x: from, a: amount })
        : tr('Te piden {a} XRP', { a: amount })
      : from
        ? tr('{x} te comparte su dirección para pagarle', { x: from })
        : tr('Dirección para pagar'),
  ];
  if (note) lines.push(tr('Motivo: {x}', { x: note }));
  lines.push(`${r.to}${r.network === 'testnet' ? ' (testnet)' : ''}`);
  if (r.tag) lines.push(tr('Destination tag: {x}', { x: r.tag }));
  lines.push('');
  lines.push(tr('Ábrelo en Quorum, elige desde qué cuenta pagar y firma: {x}', { x: link }));
  return lines.join('\n');
}
