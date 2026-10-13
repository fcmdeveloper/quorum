/**
 * Xaman (cuentas del teléfono o tarjetas Xaman).
 *
 * Quorum usa su propia app registrada en apps.xumm.dev y el inicio de sesión de Xaman
 * (OAuth2 + PKCE): la app solo lleva la API key pública, nunca un secreto. El usuario
 * aprueba "Iniciar sesión en Quorum" dentro de Xaman y recibimos un token (JWT) que vale
 * ~24 h. Con ese token pedimos firmas que Xaman devuelve SIN enviar a la red
 * (submit: false); luego verificamos la firma localmente.
 */
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { AppState } from 'react-native';
import { decode } from 'ripple-binary-codec';
import { TxJson, SignerSig, signerSigFromBlob } from '../core/tx';
import { xamanInstruction } from '../core/xamanText';
import {
  XamanSession,
  authorizeUrl,
  parseRedirect,
  pkceChallenge,
  pkceVerifier,
  sessionFromJwt,
  sessionValid as sessionNotExpired,
  tokenRequestBody,
  XAMAN_TOKEN,
} from '../core/xamanAuth';
import { compressPublicKey } from '../core/crypto';
import { QUORUM } from '../config';
export { xamanInstruction };

/**
 * Sesión usable: no vencida y obtenida con la API key actual de Quorum. Las sesiones
 * guardadas con otra key (o antes de registrar la key) se descartan y se pide iniciar sesión.
 */
export function sessionValid(s: XamanSession | null | undefined, now = Date.now()): s is XamanSession {
  return sessionNotExpired(s, now) && s.clientId === QUORUM.xamanApiKey;
}
export type { XamanSession };

/** Compatibilidad de nombre con el resto de la app. */
export type XamanCreds = XamanSession;

const API = 'https://xumm.app/api/v1/jwt';

/**
 * Abre el inicio de sesión de Xaman y devuelve una sesión nueva.
 * Si el usuario cierra la ventana, lanza un error.
 */
export async function xamanConnect(onStatus?: (s: string) => void): Promise<XamanSession> {
  if (!QUORUM.xamanApiKey) throw new Error('Falta la API key de Xaman de Quorum');
  const verifier = pkceVerifier(Crypto.getRandomBytes(32));
  const state = pkceVerifier(Crypto.getRandomBytes(32)).slice(0, 24);
  const url = authorizeUrl({
    clientId: QUORUM.xamanApiKey,
    redirectUri: QUORUM.xamanRedirect,
    challenge: pkceChallenge(verifier),
    state,
  });
  onStatus?.('Inicia sesión en Xaman…');
  const back = await waitForXamanReturn(url, state);
  const q = parseRedirect(back);
  if (q.error) throw new Error(`Xaman: ${q.error_description ?? q.error}`);
  if (q.access_token) return { ...sessionFromJwt(q.access_token, Number(q.expires_in) || undefined), clientId: QUORUM.xamanApiKey };
  if (!q.code) throw new Error('Xaman no devolvió un código de acceso');

  onStatus?.('Conectando con Xaman…');
  const tok = await fetch(XAMAN_TOKEN, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: tokenRequestBody({ clientId: QUORUM.xamanApiKey, redirectUri: QUORUM.xamanRedirect, code: q.code, verifier }),
  });
  const j: any = await tok.json().catch(() => ({}));
  if (!tok.ok || !j.access_token) throw new Error(`Xaman no entregó el token (${j.error_description ?? j.error ?? tok.status})`);
  return { ...sessionFromJwt(j.access_token, Number(j.expires_in) || undefined), clientId: QUORUM.xamanApiKey };
}

/**
 * Abre el inicio de sesión y espera el regreso. Al aprobar, Xaman suele volver por Safari
 * (no por la ventana de inicio de sesión), y la página de quorumxrpl.com abre la app con
 * quorum://xaman-auth?code=…. Por eso escuchamos ambos caminos: el resultado de la ventana
 * y el enlace que llega a la app. Gana el primero que traiga la respuesta.
 */
async function waitForXamanReturn(authUrl: string, state: string): Promise<string> {
  // Solo cuenta la respuesta de ESTE inicio de sesión. Safari puede reabrir la página de un
  // inicio de sesión anterior (con otro state) y mandar ese enlace viejo: se ignora y se sigue esperando.
  const isOurs = (u?: string | null) => {
    if (!u || !u.startsWith(QUORUM.xamanAppCallback)) return false;
    const q = parseRedirect(u);
    return q.state === state || (!!q.error && !q.state);
  };
  let resolveLink!: (u: string) => void;
  const viaLink = new Promise<string>((r) => (resolveLink = r));
  const sub = Linking.addEventListener('url', ({ url }) => {
    if (isOurs(url)) resolveLink(url);
  });
  try {
    const viaSession = WebBrowser.openAuthSessionAsync(authUrl, QUORUM.xamanAppCallback, { preferEphemeralSession: false }).then(
      async (res) => {
        if (res.type === 'success' && isOurs(res.url)) return res.url;
        // La ventana se cerró sin respuesta (pasa al saltar a Xaman). Esperamos el enlace que
        // vuelve por Safari: sin límite práctico mientras estás en Xaman, y 8 s una vez que
        // Quorum vuelve a primer plano sin respuesta.
        let got: string | null = null;
        viaLink.then((u) => (got = u));
        const hardLimit = Date.now() + 5 * 60_000;
        let activeSince: number | null = null;
        while (!got && Date.now() < hardLimit) {
          await sleep(250);
          if (AppState.currentState === 'active') activeSince ??= Date.now();
          else activeSince = null;
          if (activeSince && Date.now() - activeSince > 8_000) break;
        }
        if (got) return got;
        throw new Error('Inicio de sesión en Xaman cancelado');
      },
    );
    viaSession.catch(() => {});
    const url = await Promise.race([viaSession, viaLink]);
    try {
      WebBrowser.dismissAuthSession();
    } catch {}
    return url;
  } finally {
    sub.remove();
  }
}

async function call(s: XamanSession, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.jwt}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }
  if (json?.error?.code === 1217) {
    // No es la sesión: la app de Quorum en Xaman no tiene permiso para este tipo de transacción.
    throw new Error(
      `Xaman no permite a Quorum pedir la firma de este tipo de transacción (${txTypeOf(init.body)}). Hay que pedir a Xaman que habilite ese permiso para la app. (1217 · ${json.error.reference ?? ''})`,
    );
  }
  if (res.status === 401 || res.status === 403) {
    // Se muestra lo que dice Xaman: un 403 no siempre es una sesión vencida.
    const e = json?.error ?? {};
    const why = [e.code, e.message, e.reference].filter(Boolean).join(' · ') || text.slice(0, 200);
    const method = (init.method ?? 'GET').toUpperCase();
    throw new XamanAuthError(`La sesión de Xaman venció. Vuelve a firmar para reconectar. (${res.status} ${method} ${path.split('/').slice(0, 2).join('/')}: ${why})`);
  }
  if (!res.ok) {
    throw new Error(`Xaman API ${res.status}: ${json?.error?.reference ?? json?.error?.code ?? text.slice(0, 160)}`);
  }
  return json;
}

export class XamanAuthError extends Error {}

function txTypeOf(body: unknown): string {
  try {
    return JSON.parse(String(body))?.txjson?.TransactionType ?? '?';
  } catch {
    return '?';
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function requestSignature(
  s: XamanSession,
  txjson: TxJson,
  opts: { multisign: boolean; signerAddress: string; instruction: string; onStatus?: (s: string) => void; network?: 'mainnet' | 'testnet' },
): Promise<{ hex: string; signer: string | null }> {
  const expireMinutes = 10;
  const created = await call(s, '/payload', {
    method: 'POST',
    body: JSON.stringify({
      txjson,
      options: {
        submit: false,
        multisign: opts.multisign,
        expire: expireMinutes,
        signers: [opts.signerAddress],
        // Xaman firma en la misma red de la propuesta (si estás en otra, te pide cambiar)
        ...(opts.network ? { force_network: opts.network === 'mainnet' ? 'MAINNET' : 'TESTNET' } : {}),
        return_url: { app: Linking.createURL('xaman') },
      },
      custom_meta: { instruction: opts.instruction.slice(0, 280) },
    }),
  });
  const uuid: string = created.uuid;
  opts.onStatus?.('Abriendo Xaman…');
  await Linking.openURL(created.next.always);

  const deadline = Date.now() + expireMinutes * 60_000;
  while (Date.now() < deadline) {
    await sleep(AppState.currentState === 'active' ? 1500 : 3000);
    const p = await call(s, `/payload/${uuid}`);
    const m = p.meta;
    if (m.signed && p.response?.hex) {
      return { hex: p.response.hex, signer: p.response.signer ?? p.response.account };
    }
    if (m.cancelled) throw new Error('Cancelado en Xaman');
    if (m.expired) throw new Error('La solicitud de Xaman expiró');
    if (m.resolved && !m.signed) throw new Error('Rechazado en Xaman');
    opts.onStatus?.(m.opened_by_deeplink || m.app_opened ? 'Esperando tu firma en Xaman…' : 'Esperando que abras Xaman…');
  }
  try {
    await call(s, `/payload/${uuid}`, { method: 'DELETE' });
  } catch {}
  throw new Error('Tiempo de espera agotado');
}

/** Firma como uno de los firmantes de la multifirma. */
export async function xamanSignMulti(
  s: XamanSession,
  tx: TxJson,
  signerAddress: string,
  onStatus?: (s: string) => void,
  network?: 'mainnet' | 'testnet',
): Promise<SignerSig> {
  const { Signers, TxnSignature, ...rest } = tx;
  const res = await requestSignature(s, { ...rest, SigningPubKey: '' }, {
    multisign: true,
    signerAddress,
    instruction: xamanInstruction(tx, true),
    onStatus,
    network,
  });
  if (res.signer && res.signer !== signerAddress) {
    throw new Error(`Firmó la cuenta ${res.signer}, se esperaba ${signerAddress}`);
  }
  return signerSigFromBlob(res.hex, signerAddress);
}

/** Firma simple (cuando la cuenta de Xaman es la clave maestra de la bóveda). */
export async function xamanSignSingle(
  s: XamanSession,
  tx: TxJson,
  onStatus?: (s: string) => void,
  network?: 'mainnet' | 'testnet',
): Promise<{ publicKey: string; signature: string; signedTx: TxJson; signedHex: string }> {
  const { Signers, TxnSignature, SigningPubKey, ...rest } = tx;
  const res = await requestSignature(s, rest, {
    multisign: false,
    signerAddress: tx.Account,
    instruction: xamanInstruction(tx, false),
    onStatus,
    network,
  });
  const signed = decode(res.hex) as TxJson;
  if (!signed.TxnSignature || !signed.SigningPubKey) throw new Error('Xaman no devolvió una firma simple');
  return { publicKey: compressPublicKey(signed.SigningPubKey), signature: signed.TxnSignature, signedTx: signed, signedHex: res.hex };
}
