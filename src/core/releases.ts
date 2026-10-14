/**
 * Registro público de versiones en el XRP Ledger (ver RELEASES.md).
 *
 * - `quorum.release {…}`: lo envía la propia cuenta Quorum Releases (multifirma del Consejo).
 * - `quorum.attest {…}`: el resultado de un validador, enviado a esa cuenta.
 * - `quorum.join {…}`: inscripción de un validador.
 *
 * Solo lectura: la app consulta el ledger, no hay servidores.
 */
import { getClient, NetworkId } from './network';

export interface ReleaseRecord {
  v: string;
  build?: number;
  platform?: string;
  commit: string;
  app: string;
  js?: string;
  hash: string;
  date?: string;
  /** Cuentas que firmaron la transacción (Consejo); vacío si la firmó una sola llave. */
  signers: string[];
}

export interface Attestation {
  account: string;
  release: string;
  commit: string;
  app: string;
  result: 'pass' | 'fail';
  note?: string;
  hash: string;
  date?: string;
}

export interface JoinRecord {
  account: string;
  github?: string;
  hash: string;
  date?: string;
}

export interface ReleaseLog {
  releases: ReleaseRecord[];
  attestations: Attestation[];
  joins: JoinRecord[];
}

/** `quorum.attest {"release":…}` → { kind: 'attest', data }. Cualquier otro texto → null. */
export function parseQuorumMemo(text: string): { kind: 'release' | 'attest' | 'join'; data: any } | null {
  const m = /^\s*quorum\.(release|attest|join)\s+(\{[\s\S]*\})\s*$/.exec(text);
  if (!m) return null;
  try {
    const data = JSON.parse(m[2]);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return { kind: m[1] as any, data };
  } catch {
    return null;
  }
}

const str = (x: unknown) => (typeof x === 'string' ? x.trim() : '');
const hexToText = (h: string) => {
  try {
    return decodeURIComponent(h.replace(/(..)/g, '%$1'));
  } catch {
    return '';
  }
};
/** "sha256:ABC…" o "abc…" → "abc…" en minúsculas, sin prefijo. */
export const normHash = (h: string) => str(h).toLowerCase().replace(/^sha256:/, '');

/** Ordena las transacciones de la cuenta de registro en versiones, validaciones e inscripciones. */
export function readReleaseLog(registry: string, txs: any[]): ReleaseLog {
  const log: ReleaseLog = { releases: [], attestations: [], joins: [] };
  for (const x of txs) {
    const tx = x.tx_json ?? x.tx ?? {};
    const meta = x.meta ?? {};
    if (meta.TransactionResult && meta.TransactionResult !== 'tesSUCCESS') continue;
    const hash = x.hash ?? tx.hash ?? '';
    const date = x.close_time_iso;
    for (const mm of tx.Memos ?? []) {
      const p = parseQuorumMemo(hexToText(mm?.Memo?.MemoData ?? ''));
      if (!p) continue;
      const d = p.data;
      if (p.kind === 'release') {
        // solo cuenta si la emitió la propia cuenta de registro
        if (tx.Account !== registry || !str(d.v) || !str(d.app) || !str(d.commit)) continue;
        log.releases.push({
          v: str(d.v),
          build: typeof d.build === 'number' ? d.build : undefined,
          platform: str(d.platform) || undefined,
          commit: str(d.commit).toLowerCase(),
          app: normHash(d.app),
          js: d.js ? normHash(d.js) : undefined,
          hash,
          date,
          signers: (tx.Signers ?? []).map((s: any) => s?.Signer?.Account).filter(Boolean),
        });
      } else if (p.kind === 'attest') {
        // un pago a la cuenta de registro, desde otra cuenta
        if (tx.TransactionType !== 'Payment' || tx.Destination !== registry || tx.Account === registry) continue;
        const result = str(d.result).toLowerCase();
        if (!str(d.release) || (result !== 'pass' && result !== 'fail')) continue;
        log.attestations.push({
          account: tx.Account,
          release: str(d.release),
          commit: str(d.commit).toLowerCase(),
          app: normHash(d.app),
          result,
          note: str(d.note) || undefined,
          hash,
          date,
        });
      } else if (p.kind === 'join') {
        if (tx.Destination !== registry || tx.Account === registry) continue;
        log.joins.push({ account: tx.Account, github: str(d.github) || undefined, hash, date });
      }
    }
  }
  return log;
}

/**
 * Una validación es correcta si su commit y su huella (prefijos de al menos 7 y 8
 * caracteres) coinciden con el registro de esa versión.
 */
export function attestationMatches(r: ReleaseRecord, a: Attestation): boolean {
  if (a.release !== r.v) return false;
  if (a.commit.length < 7 || !r.commit.startsWith(a.commit)) return false;
  if (a.app.length < 8 || !r.app.startsWith(a.app)) return false;
  return true;
}

export interface ReleaseStatus {
  /** La versión registrada cuya huella coincide con la de esta app (o undefined). */
  release?: ReleaseRecord;
  /** Registros con el mismo número de versión pero otra huella (señal de alerta). */
  sameVersionOther: ReleaseRecord[];
  pass: Attestation[];
  fail: Attestation[];
}

/** Estado de la app instalada frente al registro: la versión que coincide y sus validaciones. */
export function releaseStatus(log: ReleaseLog, version: string, appHash: string): ReleaseStatus {
  const h = normHash(appHash);
  const release = log.releases.find((r) => r.app === h);
  const sameVersionOther = log.releases.filter((r) => r.v === version && r.app !== h);
  // una validación por cuenta y versión: vale la más reciente (el ledger devuelve las nuevas primero)
  const seen = new Set<string>();
  const pass: Attestation[] = [];
  const fail: Attestation[] = [];
  for (const a of log.attestations) {
    if (a.release !== (release?.v ?? version)) continue;
    const k = `${a.account}:${a.release}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // un "pass" solo cuenta si coincide con el registro; un "fail" se muestra siempre
    if (a.result === 'pass' && release && attestationMatches(release, a)) pass.push(a);
    else if (a.result === 'fail') fail.push(a);
  }
  return { release, sameVersionOther, pass, fail };
}

/** Lee las transacciones de la cuenta de registro (las más nuevas primero), con un tope. */
export async function fetchReleaseLog(net: NetworkId, registry: string, max = 1000): Promise<ReleaseLog> {
  const client = await getClient(net);
  const all: any[] = [];
  let marker: unknown;
  do {
    let r: any;
    try {
      r = await client.request({ command: 'account_tx', account: registry, limit: 200, marker, api_version: 2 } as any);
    } catch (e: any) {
      if (e?.data?.error === 'actNotFound') break;
      throw e;
    }
    all.push(...(r.result.transactions ?? []));
    marker = r.result.marker;
  } while (marker && all.length < max);
  return readReleaseLog(registry, all);
}
