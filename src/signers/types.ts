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
export const LEDGER_XRP_PATH = "44'/144'/0'/0/0";
