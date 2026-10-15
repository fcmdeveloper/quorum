/**
 * Cuando el ledger rechaza un envío porque la secuencia o el ticket ya se usó, puede ser porque
 * ESTA MISMA operación ya la envió otro teléfono (con otras firmas → otro hash). Se busca qué
 * transacción ocupó ese turno y se compara por id de propuesta (el hash sin firmas).
 */
import { ledgerTxProposalId } from './qr';

/** Resultados del nodo que significan "ese turno (secuencia/ticket) ya no está disponible". */
export const TURN_USED = new Set(['tefPAST_SEQ', 'tefNO_TICKET']);

export type UsedTurn =
  /** La envió otro teléfono y quedó en el ledger con este resultado. */
  | { kind: 'elsewhere'; hash: string; result: string }
  /** Otra operación distinta usó ese turno. */
  | { kind: 'other' }
  /** No se encontró (todavía) quién lo usó. */
  | { kind: 'unknown' };

export function classifyUsedTurn(proposalId: string, found: { tx: any; hash: string; result: string } | null): UsedTurn {
  if (!found) return { kind: 'unknown' };
  if (ledgerTxProposalId(found.tx) === proposalId) return { kind: 'elsewhere', hash: found.hash, result: found.result };
  return { kind: 'other' };
}
