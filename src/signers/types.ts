export type SignerKind = 'tangem' | 'ledger' | 'xaman';

export interface SignerDevice {
  id: string;
  label: string;
  kind: SignerKind;
  /** Dirección XRPL (r...) de este firmante */
  address: string;
  /** Clave pública secp256k1 comprimida (hex). Xaman la informa al firmar. */
  publicKey?: string;
  tangem?: {
    cardId: string;
    /** Clave pública maestra de la wallet en la tarjeta (la que pide SIGN_HASH) */
    walletPublicKey: string;
    /** Ruta de derivación si la tarjeta es HD (Tangem Wallet 2.0), p. ej. m/44'/144'/0'/0/0 */
    derivationPath?: string;
  };
  ledger?: {
    path: string;
    deviceId: string;
    deviceName?: string;
  };
  createdAt: number;
}

export const KIND_LABEL: Record<SignerKind, string> = {
  tangem: 'Tangem',
  ledger: 'Ledger',
  xaman: 'Xaman',
};

/** Ruta BIP44 de XRP que usan Ledger y la app Tangem */
export const XRP_PATH = "m/44'/144'/0'/0/0";
/** Cuentas de la app Tangem (Multi-Accounts): la cuenta N usa el índice de cuenta N-1, en la tercera posición. */
export const MAX_TANGEM_ACCOUNTS = 20;
export const xrpAccountPath = (account: number) => `m/44'/144'/${account - 1}'/0/0`;
export const LEDGER_XRP_PATH = "44'/144'/0'/0/0";
/** Cuentas de Ledger Live: la cuenta N usa el índice de cuenta N-1 (como Tangem). */
export const MAX_LEDGER_ACCOUNTS = 20;
export const ledgerAccountPath = (account: number) => `44'/144'/${account - 1}'/0/0`;
