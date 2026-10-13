/**
 * Inicio de sesión con Xaman (OAuth2 + PKCE). Funciones puras, sin dependencias de React Native.
 * La app solo lleva la API key pública de Quorum; no hay secreto dentro de la app.
 */
import { sha256 } from '@noble/hashes/sha2.js';

export const XAMAN_AUTHORIZE = 'https://oauth2.xumm.app/auth';
export const XAMAN_TOKEN = 'https://oauth2.xumm.app/token';

export interface XamanSession {
  /** JWT de Xaman (vale ~24 h, no se puede renovar). */
  jwt: string;
  /** Vencimiento en ms epoch. */
  exp: number;
  /** Cuenta con la que se inició sesión en Xaman, si viene en el token. */
  account?: string;
  /** API key de Quorum con la que se obtuvo el token (si cambia la key, la sesión ya no sirve). */
  clientId?: string;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64[n & 63];
  }
  return out.replace(/\+/g, '-').replace(/\//g, '_');
}

function base64urlDecodeToString(s: string): string {
  const clean = s.replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  const bytes: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buf >> bits) & 0xff);
    }
  }
  // UTF-8
  return decodeURIComponent(bytes.map((b) => '%' + b.toString(16).padStart(2, '0')).join(''));
}

/** code_verifier de 43+ caracteres a partir de 32 bytes aleatorios. */
export function pkceVerifier(random: Uint8Array): string {
  if (random.length < 32) throw new Error('Se necesitan 32 bytes aleatorios');
  return base64url(random);
}

export function pkceChallenge(verifier: string): string {
  return base64url(sha256(new TextEncoder().encode(verifier)));
}

export function authorizeUrl(p: { clientId: string; redirectUri: string; challenge: string; state: string }): string {
  const q = [
    ['response_type', 'code'],
    ['client_id', p.clientId],
    ['redirect_uri', p.redirectUri],
    ['scope', 'XummPkce'],
    ['state', p.state],
    ['code_challenge', p.challenge],
    ['code_challenge_method', 'S256'],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
  return `${XAMAN_AUTHORIZE}?${q}`;
}

export function tokenRequestBody(p: { clientId: string; redirectUri: string; code: string; verifier: string }): string {
  return [
    ['grant_type', 'authorization_code'],
    ['code', p.code],
    ['client_id', p.clientId],
    ['redirect_uri', p.redirectUri],
    ['code_verifier', p.verifier],
  ]
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

/** Lee los parámetros de la URL de regreso (?code=…&state=… o #access_token=…). */
export function parseRedirect(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = url.split(/[?#]/).slice(1).join('&');
  for (const kv of parts.split('&')) {
    if (!kv) continue;
    const [k, ...v] = kv.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.join('=').replace(/\+/g, ' '));
  }
  return out;
}

export function decodeJwt(jwt: string): Record<string, any> {
  const part = jwt.split('.')[1];
  if (!part) throw new Error('Token de Xaman inválido');
  return JSON.parse(base64urlDecodeToString(part));
}

export function sessionFromJwt(jwt: string, expiresInSec?: number): XamanSession {
  const claims = decodeJwt(jwt);
  const exp = claims.exp ? claims.exp * 1000 : Date.now() + (expiresInSec ?? 23 * 3600) * 1000;
  const account = typeof claims.sub === 'string' && claims.sub.startsWith('r') ? claims.sub : undefined;
  return { jwt, exp, account };
}

/** Válida si le quedan al menos 15 minutos (lo que dura una solicitud de firma). */
export function sessionValid(s: XamanSession | null | undefined, now = Date.now()): s is XamanSession {
  return !!s?.jwt && s.exp - now > 15 * 60_000;
}
