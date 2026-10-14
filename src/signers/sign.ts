/**
 * Punto único para firmar con cualquier dispositivo.
 * Cada firma se verifica localmente antes de aceptarse.
 */
import { multisignHash, singleSignHash, compressPublicKey } from '../core/crypto';
import { TxJson, SignerSig, verifySignerSig, attachSingleSignature, acceptXamanSigned } from '../core/tx';
import { SignerDevice } from './types';
import { tangemSignHash } from './tangem';
import { ledgerSignMulti, ledgerSignSingle } from './ledger';
import { xamanSignMulti, xamanSignSingle, XamanSession } from './xaman';
import { t } from '../i18n';

export interface SignContext {
  /** Devuelve una sesión de Xaman válida (inicia sesión si hace falta). */
  xamanSession?: () => Promise<XamanSession>;
  onStatus?: (s: string) => void;
  /** Red de la propuesta: Xaman firma forzado en esa red. */
  network?: 'mainnet' | 'testnet';
}

/** Firma `tx` como miembro de la lista de firmantes. */
export async function signAsMultisigner(device: SignerDevice, tx: TxJson, ctx: SignContext): Promise<SignerSig> {
  let sig: SignerSig;
  switch (device.kind) {
    case 'tangem': {
      if (!device.tangem || !device.publicKey) throw new Error('Firmante Tangem incompleto: vuelve a escanear la tarjeta');
      ctx.onStatus?.('Acerca la tarjeta al teléfono…');
      const der = await tangemSignHash(multisignHash(tx, device.address), device.tangem, t('Multifirma · {x}', { x: tx.TransactionType }));
      sig = { Account: device.address, SigningPubKey: device.publicKey, TxnSignature: der };
      break;
    }
    case 'ledger': {
      if (!device.ledger || !device.publicKey) throw new Error('Firmante Ledger incompleto');
      ctx.onStatus?.('Revisa y aprueba en la pantalla del Ledger…');
      const der = await ledgerSignMulti(device.ledger.deviceId, tx, device.ledger.path, device.publicKey);
      sig = { Account: device.address, SigningPubKey: device.publicKey, TxnSignature: der };
      break;
    }
    case 'xaman': {
      if (!ctx.xamanSession) throw new Error('Xaman no disponible');
      sig = await xamanSignMulti(await ctx.xamanSession(), tx, device.address, ctx.onStatus, ctx.network);
      break;
    }
  }
  sig.SigningPubKey = compressPublicKey(sig.SigningPubKey);
  if (!verifySignerSig(tx, sig)) {
    throw new Error('La firma recibida no corresponde a esta transacción. No se guardó.');
  }
  return sig;
}

/**
 * Firma simple con la clave maestra de la bóveda (solo para la configuración inicial,
 * antes de desactivar la master key). `device.address` debe ser la dirección de la bóveda.
 */
export async function signAsMaster(
  device: SignerDevice,
  tx: TxJson,
  ctx: SignContext,
): Promise<{ blob: string; hash: string; tx: TxJson }> {
  if (device.address !== tx.Account) throw new Error('Este dispositivo no es la clave maestra de la bóveda');
  switch (device.kind) {
    case 'tangem': {
      if (!device.tangem || !device.publicKey) throw new Error('Tangem incompleto');
      const withKey = { ...tx, SigningPubKey: device.publicKey };
      ctx.onStatus?.('Acerca la tarjeta al teléfono…');
      const der = await tangemSignHash(singleSignHash(withKey), device.tangem, t('Bóveda · {x}', { x: tx.TransactionType }));
      return attachSingleSignature(tx, device.publicKey, der);
    }
    case 'ledger': {
      if (!device.ledger || !device.publicKey) throw new Error('Ledger incompleto');
      ctx.onStatus?.('Revisa y aprueba en la pantalla del Ledger…');
      const der = await ledgerSignSingle(device.ledger.deviceId, tx, device.publicKey, device.ledger.path);
      return attachSingleSignature(tx, device.publicKey, der);
    }
    case 'xaman': {
      if (!ctx.xamanSession) throw new Error('Xaman no disponible');
      // Xaman puede ajustar comisión/secuencia antes de firmar: se valida y se usa lo que firmó
      const r = await xamanSignSingle(await ctx.xamanSession(), tx, ctx.onStatus, ctx.network);
      return acceptXamanSigned(tx, r.signedHex);
    }
  }
}
