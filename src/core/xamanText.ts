import { TxJson, describeTx } from './tx';

/**
 * Texto que Xaman muestra arriba de la solicitud: qué es y que viene de Quorum.
 * Ej.: "Quorum · Pago de 25 XRP a rPEPP…GDY (multifirma)".
 */
export function xamanInstruction(tx: TxJson, multisign: boolean): string {
  const d = describeTx(tx);
  const get = (k: string) => d.lines.find(([key]) => key === k)?.[1];
  const short = (a?: string) => (a && a.startsWith('r') && a.length > 20 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
  let text = `Quorum · ${d.title}`;
  const amount = get('Monto') ?? get('Entregas');
  const dest = get('Destino');
  if (amount) text += ` de ${amount}`;
  if (dest) text += ` a ${short(dest)}`;
  if (multisign) text += ' (firma de bóveda multifirma)';
  return text.slice(0, 280);
}

