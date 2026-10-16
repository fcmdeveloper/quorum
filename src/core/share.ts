/**
 * Compartir una operación por WhatsApp, Telegram, correo, etc. (además del QR en persona).
 *
 * El enlace lleva la operación DESPUÉS del `#`: https://quorumxrpl.com/p#q=QRM1…&f=Alex&n=Pago
 * Lo que va tras el `#` no se envía al servidor (el navegador no lo manda): la web solo ofrece
 * "Abrir en Quorum". La app abre el mismo enlace (enlace universal) o `quorum://p#…`.
 *
 * El contenido es el mismo del QR: la operación y firmas públicas, nunca claves. El nombre y el
 * motivo son solo contexto y NO están verificados: lo que se firma es la operación que muestra la app.
 */
import { isProposalQr } from './qr';

export interface SharedProposal {
  /** Texto del QR de la operación (QRM1|…). */
  qr: string;
  /** Quién la comparte (lo escribe esa persona; no verificado). */
  from?: string;
  /** Motivo (lo escribe esa persona; no verificado). */
  note?: string;
}

export const MAX_FROM = 40;
export const MAX_NOTE = 140;

/** Una sola línea, sin caracteres de control, con largo máximo. */
export function cleanText(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  const v = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  return v || undefined;
}

export function proposalFragment(s: SharedProposal): string {
  const parts = [`q=${encodeURIComponent(s.qr)}`];
  const from = cleanText(s.from, MAX_FROM);
  const note = cleanText(s.note, MAX_NOTE);
  if (from) parts.push(`f=${encodeURIComponent(from)}`);
  if (note) parts.push(`n=${encodeURIComponent(note)}`);
  return parts.join('&');
}

/** Enlace web que abre la operación en Quorum. */
export function proposalLink(website: string, s: SharedProposal): string {
  return `${website.replace(/\/+$/, '')}/p#${proposalFragment(s)}`;
}

/**
 * Lee una operación compartida desde un enlace (https://…/p#…, quorum://p#…), desde un texto que
 * contiene el enlace (el mensaje completo pegado) o desde el texto del QR (QRM1|…). null si no hay.
 */
export function parseSharedProposal(text: string | null | undefined): SharedProposal | null {
  if (!text) return null;
  const raw = text.trim();
  if (isProposalQr(raw)) return { qr: raw };
  const m = /(?:https?:\/\/[^\s#]+\/p\/?|quorum:\/\/p\/?)#([^\s]+)/i.exec(raw);
  if (m) {
    const params = new Map<string, string>();
    for (const kv of m[1].split('&')) {
      const i = kv.indexOf('=');
      if (i <= 0) continue;
      try {
        params.set(kv.slice(0, i), decodeURIComponent(kv.slice(i + 1)));
      } catch {}
    }
    const qr = params.get('q');
    if (!qr || !isProposalQr(qr)) return null;
    return { qr, from: cleanText(params.get('f'), MAX_FROM), note: cleanText(params.get('n'), MAX_NOTE) };
  }
  // un QRM1 suelto dentro de un texto
  const q = /QRM1\|[mt]\|[A-Za-z0-9+/=]+/.exec(raw);
  return q && isProposalQr(q[0]) ? { qr: q[0] } : null;
}

export interface ShareSummary {
  title: string;
  /** Pares ya traducidos, p. ej. ["Monto", "50 XRP"]. */
  details: [string, string][];
  account: string;
  testnet: boolean;
  signed: number;
  needed: number;
  minutesLeft: number | null;
  /** Se devuelve con la firma propia a quien la envió (o al siguiente firmante). */
  reply?: boolean;
}

/** Mensaje listo para compartir. `tr` traduce los textos fijos (español es la clave). */
export function shareMessage(s: SharedProposal, sum: ShareSummary, link: string, tr: (k: string, v?: Record<string, string | number>) => string): string {
  const from = cleanText(s.from, MAX_FROM);
  const note = cleanText(s.note, MAX_NOTE);
  const complete = sum.signed >= sum.needed;
  const lines = [
    sum.reply
      ? from
        ? tr('{x} ya firmó en Quorum y te la devuelve', { x: from })
        : tr('Ya firmé en Quorum y te la devuelvo')
      : from
        ? tr('{x} te pide firmar en Quorum', { x: from })
        : tr('Te piden firmar en Quorum'),
  ];
  lines.push(`${sum.title} · ${sum.account}${sum.testnet ? ' (testnet)' : ''}`);
  for (const [k, v] of sum.details) lines.push(`${k}: ${v}`);
  if (note) lines.push(tr('Motivo: {x}', { x: note }));
  const status = [tr('Firmas: {a} de {b}', { a: sum.signed, b: sum.needed })];
  if (sum.minutesLeft !== null && sum.minutesLeft > 0) status.push(tr('vence en ~{x} min', { x: sum.minutesLeft }));
  lines.push(status.join(' · '));
  lines.push('');
  lines.push(
    sum.reply
      ? complete
        ? tr('Ya tiene todas las firmas. Ábrela en Quorum y envíala a la red: {x}', { x: link })
        : tr('Ábrela en Quorum para sumar esta firma (si te falta firmar, firma también): {x}', { x: link })
      : tr('Ábrela en Quorum, revisa la operación y firma: {x}', { x: link }),
  );
  return lines.join('\n');
}
