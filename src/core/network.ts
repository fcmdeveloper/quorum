/**
 * Conexión a XRPL, lectura del estado de las cuentas, NFTs, actividad,
 * preparación y envío de transacciones.
 */
import { Client, convertHexToString } from 'xrpl';
import { locale, t as tl } from '../i18n';
import { ACCOUNT_FLAGS, HARDENING, TxJson, SignerEntryInput, dropsToXrp } from './tx';

export type NetworkId = 'testnet' | 'mainnet';

export const NETWORKS: Record<NetworkId, { label: string; urls: string[]; explorer: string }> = {
  testnet: {
    label: 'Testnet',
    urls: ['wss://s.altnet.rippletest.net:51233', 'wss://testnet.xrpl-labs.com'],
    explorer: 'https://testnet.xrpl.org',
  },
  mainnet: {
    label: 'Mainnet',
    urls: ['wss://xrplcluster.com', 'wss://s1.ripple.com', 'wss://s2.ripple.com'],
    explorer: 'https://livenet.xrpl.org',
  },
};

const clients: Partial<Record<NetworkId, Client>> = {};
const connecting: Partial<Record<NetworkId, Promise<Client>>> = {};

export async function getClient(net: NetworkId): Promise<Client> {
  const c = clients[net];
  if (c && c.isConnected()) return c;
  if (connecting[net]) return connecting[net]!;
  connecting[net] = (async () => {
    let lastErr: unknown;
    for (const url of NETWORKS[net].urls) {
      const client = new Client(url, { connectionTimeout: 10000 });
      try {
        await client.connect();
        clients[net] = client;
        return client;
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error(tl('Sin conexión a {net}: {e}', { net: NETWORKS[net].label, e: String((lastErr as any)?.message ?? lastErr) }));
  })();
  try {
    return await connecting[net]!;
  } finally {
    delete connecting[net];
  }
}

export interface TokenBalance {
  currency: string;
  issuer: string;
  balance: string;
  label: string;
}

export interface AccountState {
  address: string;
  exists: boolean;
  balanceXrp: string;
  spendableXrp: string;
  reserveXrp: string;
  sequence: number;
  masterDisabled: boolean;
  regularKey: string | null;
  signerList: { quorum: number; entries: SignerEntryInput[] } | null;
  hardening: { asf: number; label: string; on: boolean }[];
  tickets: number[];
  tokens: TokenBalance[];
  ownerCount: number;
  ledgerIndex: number;
  fetchedAt: number;
  /** Campo WalletLocator de la cuenta: Quorum lo usa para fijar un NFT como imagen (ver core/pin.ts). */
  walletLocator?: string | null;
}

/** Nombre legible de un código de moneda (3 letras o hex de 40). */
export function currencyLabel(code: string): string {
  if (code.length === 40) {
    try {
      const s = convertHexToString(code).replace(/\0/g, '');
      if (/^[\x20-\x7E]+$/.test(s)) return s;
    } catch {}
    return code.slice(0, 8) + '…';
  }
  return code;
}

export async function fetchAccountState(net: NetworkId, address: string): Promise<AccountState> {
  const client = await getClient(net);
  let info: any;
  try {
    info = await client.request({ command: 'account_info', account: address, ledger_index: 'validated', signer_lists: true } as any);
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') {
      return {
        address,
        exists: false,
        balanceXrp: '0',
        spendableXrp: '0',
        reserveXrp: '0',
        sequence: 0,
        masterDisabled: false,
        regularKey: null,
        signerList: null,
        hardening: HARDENING.map((h) => ({ asf: h.asf, label: h.label, on: false })),
        tickets: [],
        tokens: [],
        ownerCount: 0,
        ledgerIndex: 0,
        fetchedAt: Date.now(),
      };
    }
    throw e;
  }
  const data = info.result.account_data;
  const lists = info.result.signer_lists ?? data.signer_lists ?? [];
  const sl = lists[0];
  const [server, lines, tickets]: any[] = await Promise.all([
    client.request({ command: 'server_state' } as any),
    client.request({ command: 'account_lines', account: address, ledger_index: 'validated' } as any).catch(() => null),
    client
      .request({ command: 'account_objects', account: address, type: 'ticket', ledger_index: 'validated', limit: 250 } as any)
      .catch(() => null),
  ]);
  const vl = server.result.state.validated_ledger;
  const reserve = BigInt(vl.reserve_base) + BigInt(vl.reserve_inc) * BigInt(data.OwnerCount);
  const bal = BigInt(data.Balance);
  const spendable = bal > reserve ? bal - reserve : 0n;
  const flags: number = data.Flags ?? 0;

  return {
    address,
    exists: true,
    balanceXrp: dropsToXrp(bal.toString()),
    spendableXrp: dropsToXrp(spendable.toString()),
    reserveXrp: dropsToXrp(reserve.toString()),
    sequence: data.Sequence,
    masterDisabled: (flags & ACCOUNT_FLAGS.lsfDisableMaster) !== 0,
    regularKey: data.RegularKey ?? null,
    signerList: sl
      ? {
          quorum: sl.SignerQuorum,
          entries: sl.SignerEntries.map((e: any) => ({ account: e.SignerEntry.Account, weight: e.SignerEntry.SignerWeight })),
        }
      : null,
    hardening: HARDENING.map((h) => ({ asf: h.asf, label: h.label, on: (flags & h.lsf) !== 0 })),
    tickets: (tickets?.result?.account_objects ?? []).map((t: any) => t.TicketSequence).sort((a: number, b: number) => a - b),
    tokens: (lines?.result?.lines ?? []).map((l: any) => ({
      currency: l.currency,
      issuer: l.account,
      balance: l.balance,
      label: currencyLabel(l.currency),
    })),
    ownerCount: data.OwnerCount,
    ledgerIndex: info.result.ledger_index ?? vl.seq,
    fetchedAt: Date.now(),
    walletLocator: typeof data.WalletLocator === 'string' && /[1-9A-F]/i.test(data.WalletLocator) ? data.WalletLocator.toUpperCase() : null,
  };
}

// ───────────────────────────── Actividad ─────────────────────────────

export type ActivityKind = 'in' | 'out' | 'config' | 'dex' | 'nft' | 'other';

export interface ActivityItem {
  hash: string;
  account: string;
  date: number;
  type: string;
  kind: ActivityKind;
  title: string;
  counterparty?: string;
  xrp?: string;
  token?: string;
  success: boolean;
  fee?: string;
  multisig: boolean;
}

function amountText(a: any): { xrp?: string; token?: string } {
  if (a == null) return {};
  if (typeof a === 'string') return { xrp: dropsToXrp(a) };
  if (a.currency) return { token: `${Number(a.value).toLocaleString(locale(), { maximumFractionDigits: 6 })} ${currencyLabel(a.currency)}` };
  return {};
}

export function describeActivity(account: string, tx: any, meta: any, closeIso?: string): ActivityItem {
  const t = tx.TransactionType as string;
  const success = meta?.TransactionResult === 'tesSUCCESS';
  const base = {
    hash: tx.hash,
    account,
    date: closeIso ? Date.parse(closeIso) : tx.date ? (tx.date + 946684800) * 1000 : Date.now(),
    type: t,
    success,
    fee: tx.Account === account && tx.Fee ? dropsToXrp(tx.Fee) : undefined,
    multisig: Array.isArray(tx.Signers) && tx.Signers.length > 0,
  };
  switch (t) {
    case 'Payment': {
      const delivered = meta?.delivered_amount ?? tx.DeliverMax ?? tx.Amount;
      const amt = amountText(delivered);
      const incoming = tx.Destination === account;
      return {
        ...base,
        kind: incoming ? 'in' : 'out',
        title: incoming ? 'Recibido' : 'Enviado',
        counterparty: incoming ? tx.Account : tx.Destination,
        ...amt,
      };
    }
    case 'SignerListSet':
      return { ...base, kind: 'config', title: tx.SignerQuorum ? tl('Multifirma: quórum {n}', { n: tx.SignerQuorum }) : 'Multifirma eliminada' };
    case 'AccountSet': {
      let title = 'Ajustes de cuenta';
      if (typeof tx.WalletLocator === 'string') title = /[1-9A-F]/i.test(tx.WalletLocator) ? 'NFT fijado como imagen' : 'NFT fijado quitado';
      else if (tx.SetFlag === 4) title = 'Master key desactivada';
      else if (tx.ClearFlag === 4) title = 'Master key reactivada';
      else {
        const h = HARDENING.find((x) => x.asf === tx.SetFlag);
        const c = HARDENING.find((x) => x.asf === tx.ClearFlag);
        if (h) title = h.label;
        else if (c) title = c.allow;
      }
      return { ...base, kind: 'config', title };
    }
    case 'SetRegularKey':
      return { ...base, kind: 'config', title: tx.RegularKey ? 'Clave regular asignada' : 'Clave regular quitada' };
    case 'TicketCreate':
      return { ...base, kind: 'config', title: tl('{n} tickets creados', { n: tx.TicketCount }) };
    case 'TrustSet':
      return { ...base, kind: 'config', title: tl('Línea de confianza {x}', { x: currencyLabel(tx.LimitAmount?.currency ?? '') }) };
    case 'OfferCreate':
      return { ...base, kind: 'dex', title: (tx.Flags ?? 0) & 0x00040000 ? 'Swap' : 'Orden en el DEX' };
    case 'OfferCancel':
      return { ...base, kind: 'dex', title: 'Orden cancelada' };
    case 'NFTokenMint':
    case 'NFTokenBurn':
    case 'NFTokenCreateOffer':
    case 'NFTokenAcceptOffer':
    case 'NFTokenCancelOffer':
      return { ...base, kind: 'nft', title: t.replace('NFToken', 'NFT ') };
    case 'EscrowCreate':
      return { ...base, kind: 'out', title: 'Escrow creado', ...amountText(tx.Amount) };
    case 'EscrowFinish':
      return { ...base, kind: 'in', title: 'Escrow liberado' };
    default:
      return { ...base, kind: 'other', title: t };
  }
}

export async function fetchActivity(net: NetworkId, address: string, limit = 30): Promise<ActivityItem[]> {
  const client = await getClient(net);
  try {
    const r: any = await client.request({ command: 'account_tx', account: address, limit, api_version: 2 } as any);
    return r.result.transactions.map((x: any) => {
      const tx = { ...(x.tx_json ?? x.tx), hash: x.hash ?? x.tx_json?.hash ?? x.tx?.hash };
      return describeActivity(address, tx, x.meta, x.close_time_iso);
    });
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return [];
    throw e;
  }
}

/**
 * La transacción de `address` que usó esa secuencia o ese ticket, si ya está en el ledger.
 * Una secuencia o un ticket solo los puede consumir una transacción.
 */
export async function findTxBySequence(
  net: NetworkId,
  address: string,
  by: { sequence?: number; ticket?: number },
  maxTxs = 400,
): Promise<{ tx: any; hash: string; result: string } | null> {
  const client = await getClient(net);
  let marker: unknown;
  let seen = 0;
  do {
    const r: any = await client.request({ command: 'account_tx', account: address, limit: 200, marker, api_version: 2 } as any);
    for (const x of r.result.transactions ?? []) {
      const tx = x.tx_json ?? x.tx ?? {};
      if (tx.Account !== address) continue;
      const hit = by.ticket ? tx.TicketSequence === by.ticket : by.sequence !== undefined && !tx.TicketSequence && tx.Sequence === by.sequence;
      if (hit) return { tx, hash: x.hash ?? tx.hash ?? '', result: x.meta?.TransactionResult ?? '' };
    }
    seen += (r.result.transactions ?? []).length;
    marker = r.result.marker;
  } while (marker && seen < maxTxs);
  return null;
}

/** ¿La cuenta ya envió con éxito alguna transacción firmada con multifirma? (prueba del quórum) */
export async function hasMultisigTx(net: NetworkId, address: string): Promise<boolean> {
  const client = await getClient(net);
  try {
    const r: any = await client.request({ command: 'account_tx', account: address, limit: 200, api_version: 2 } as any);
    return (r.result.transactions ?? []).some((x: any) => {
      const tx = x.tx_json ?? x.tx ?? {};
      return tx.Account === address && Array.isArray(tx.Signers) && tx.Signers.length > 0 && x.meta?.TransactionResult === 'tesSUCCESS';
    });
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return false;
    throw e;
  }
}

// ───────────────────────────── NFTs ─────────────────────────────

export interface NftItem {
  id: string;
  issuer: string;
  taxon: number;
  serial: number;
  uri?: string;
  name?: string;
  description?: string;
  image?: string;
  collection?: string;
  attributes?: { trait_type?: string; value?: any }[];
  /** No se pudo leer la metadata (red, timeout o gateway caído): hay que reintentar. */
  metaFailed?: boolean;
}

/**
 * Gateways IPFS públicos. ipfs.io y dweb.link dejaron de servir a apps el 21-sep-2026
 * (responden 429 a todo), así que ya no se usan. Se prueban en paralelo y escalonados, y se
 * prefiere el que mejor viene respondiendo en esta sesión.
 */
export const IPFS_GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://ipfs.aleph.cloud/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://nftstorage.link/ipfs/'];

const gwScore = IPFS_GATEWAYS.map(() => 0);
/** Índices de los gateways, del que mejor responde al que peor (estable ante empates). */
export function gatewayOrder(): number[] {
  return IPFS_GATEWAYS.map((_, i) => i).sort((a, b) => gwScore[b] - gwScore[a] || a - b);
}
/** Anota si un gateway respondió bien o mal, para preferirlo (o no) en lo que sigue. */
export function markGateway(i: number, ok: boolean) {
  if (i < 0 || i >= gwScore.length) return;
  gwScore[i] = Math.max(-10, Math.min(10, gwScore[i] + (ok ? 2 : -1)));
}
/** Gateway de una URL ya armada (o -1). */
export function gatewayOfUrl(url: string): number {
  return IPFS_GATEWAYS.findIndex((g) => url.startsWith(g));
}

/** Extrae la ruta IPFS (CID + ruta) de cualquier forma común de URI, o null si no es IPFS. */
export function ipfsPath(u?: string): string | null {
  if (!u) return null;
  const t = u.trim();
  if (t.startsWith('ipfs://')) return t.slice(7).replace(/^ipfs\//, '');
  const m = t.match(/\/ipfs\/((?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,}).*)$/);
  if (m) return m[1];
  // forma "subdominio": https://<cid>.ipfs.<gateway>/ruta (muy usada por nft.storage y dweb.link)
  const sub = t.match(/^https?:\/\/(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})\.ipfs\.[^/?#]+(\/[^?#]*)?/i);
  if (sub) return sub[1] + (sub[2] && sub[2] !== '/' ? sub[2] : '');
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/.test(t)) return t;
  return null;
}

/**
 * Convierte una URI de NFT (ipfs://, CID, ar://, https) a URL http. `attempt` es el intento:
 * 0 = el gateway que mejor viene respondiendo, 1 = el siguiente, etc. Con `order` se fija el
 * orden (para que una imagen no salte de gateway si el orden cambia mientras carga).
 */
export function ipfsToHttp(u?: string, attempt = 0, order: number[] = gatewayOrder()): string | undefined {
  if (!u) return undefined;
  const t = u.trim();
  const p = ipfsPath(t);
  if (p) return IPFS_GATEWAYS[order[Math.min(attempt, order.length - 1)]] + p;
  if (t.startsWith('ar://')) return 'https://arweave.net/' + t.slice(5);
  return t;
}

const toNftItem = (n: any): NftItem => {
  let uri: string | undefined;
  try {
    uri = n.URI ? convertHexToString(n.URI) : undefined;
  } catch {}
  return { id: n.NFTokenID, issuer: n.Issuer, taxon: n.NFTokenTaxon, serial: n.nft_serial, uri };
};

/** Una página de NFTs de la cuenta (hasta 400). `marker` sigue con la siguiente; sin marker no hay más. */
export async function fetchNftsPage(net: NetworkId, address: string, marker?: unknown): Promise<{ items: NftItem[]; marker?: unknown }> {
  const client = await getClient(net);
  try {
    const r: any = await client.request({ command: 'account_nfts', account: address, limit: 400, marker } as any);
    return { items: (r.result.account_nfts ?? []).map(toNftItem), marker: r.result.marker };
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return { items: [] };
    throw e;
  }
}

/**
 * Todos los NFTs de la cuenta, página por página. Si hay más de `max`, lanza un error en vez de
 * devolver una lista incompleta: quien revisa si un NFT sigue en la cuenta no debe concluir
 * "ya no está" solo porque quedó fuera de la primera página.
 */
export async function fetchNfts(net: NetworkId, address: string, max = 20_000): Promise<NftItem[]> {
  const out: NftItem[] = [];
  let marker: unknown;
  do {
    const page = await fetchNftsPage(net, address, marker);
    out.push(...page.items);
    marker = page.marker;
    if (marker && out.length >= max) throw new Error(tl('La cuenta tiene más de {n} NFTs', { n: max }));
  } while (marker);
  return out;
}

/** Busca un NFT en una cuenta, página por página, y para apenas lo encuentra. null: no está. */
export async function findNftIn(net: NetworkId, owner: string, nftId: string): Promise<NftItem | null> {
  const id = nftId.toUpperCase();
  let marker: unknown;
  do {
    const page = await fetchNftsPage(net, owner, marker);
    const hit = page.items.find((n) => n.id.toUpperCase() === id);
    if (hit) return hit;
    marker = page.marker;
  } while (marker);
  return null;
}

function pickImage(j: any): string | undefined {
  return j?.image ?? j?.image_url ?? j?.imageUrl ?? j?.properties?.image ?? j?.animation_url ?? j?.content?.url;
}

async function fetchWithTimeout(url: string, ms: number, outer?: AbortSignal) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  const onOuter = () => ctrl.abort();
  outer?.addEventListener?.('abort', onOuter);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json, image/*;q=0.8, */*;q=0.5' } });
  } finally {
    clearTimeout(to);
    outer?.removeEventListener?.('abort', onOuter);
  }
}

/**
 * Pide lo mismo a varios gateways, escalonado: parte con el mejor y, si no responde en
 * `stagger` ms (o falla), suma el siguiente sin cortar el anterior. Gana la primera respuesta
 * buena y se cancelan las demás. Devuelve null si ninguno respondió antes de `deadline`.
 */
export async function fetchFromGateways(
  path: string,
  { stagger = 1200, deadline = 15000 }: { stagger?: number; deadline?: number } = {},
): Promise<Response | null> {
  const order = gatewayOrder();
  const stop = new AbortController();
  return new Promise<Response | null>((resolve) => {
    let started = 0;
    let finished = 0;
    let done = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const end = (r: Response | null) => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      clearTimeout(killer);
      stop.abort();
      resolve(r);
    };
    const killer = setTimeout(() => end(null), deadline);
    const next = () => {
      if (done || started >= order.length) return;
      const gi = order[started++];
      if (timer) clearTimeout(timer);
      timer = setTimeout(next, stagger);
      const ctrl = new AbortController();
      stop.signal.addEventListener?.('abort', () => ctrl.abort());
      fetchWithTimeout(IPFS_GATEWAYS[gi] + path, deadline, ctrl.signal)
        .then((res) => {
          if (done) return;
          // un 200 con HTML es una página de error del gateway (bloqueo, límite), no el NFT
          if (res.ok && !/text\/html/i.test(res.headers.get('content-type') ?? '')) {
            markGateway(gi, true);
            // la respuesta ganadora no se cancela: solo las demás
            done = true;
            if (timer) clearTimeout(timer);
            clearTimeout(killer);
            stopOthers(gi);
            resolve(res);
          } else {
            markGateway(gi, false);
            fail();
          }
        })
        .catch(() => {
          if (done) return;
          markGateway(gi, false);
          fail();
        });
      ctrls.set(gi, ctrl);
    };
    const ctrls = new Map<number, AbortController>();
    const stopOthers = (keep: number) => ctrls.forEach((c, gi) => gi !== keep && c.abort());
    const fail = () => {
      finished++;
      if (finished >= order.length) end(null);
      else if (finished >= started) next(); // todos los iniciados fallaron: no esperar
    };
    next();
  });
}

/** Lee la respuesta de metadata: JSON con imagen, o la imagen misma. */
async function parseMeta(n: NftItem, res: Response): Promise<NftItem> {
  const ct = res.headers.get('content-type') ?? '';
  if (ct.startsWith('image/') || ct.startsWith('video/')) return { ...n, image: n.uri };
  const text = await res.text();
  let j: any;
  try {
    j = JSON.parse(text);
  } catch {
    // sin JSON válido: probablemente es una imagen servida sin content-type
    return { ...n, image: n.uri };
  }
  return {
    ...n,
    name: j.name ?? n.name,
    description: j.description,
    image: pickImage(j),
    collection: typeof j.collection === 'object' ? j.collection?.name : j.collection,
    attributes: Array.isArray(j.attributes) ? j.attributes : undefined,
  };
}

/**
 * Carga la metadata (JSON) de un NFT. Si es IPFS, pide a varios gateways a la vez
 * (escalonado) y se queda con el primero que responda; acepta que la URI apunte directo a
 * una imagen. Nunca lanza: si nada responde, el NFT queda marcado para reintentar.
 */
export async function loadNftMetadata(n: NftItem): Promise<NftItem> {
  if (!n.uri) return n;
  const uri = n.uri.trim();
  if (uri.startsWith('data:image/')) return { ...n, image: uri };
  const path = ipfsPath(uri);
  const url = path ? IPFS_GATEWAYS[0] + path : ipfsToHttp(uri);
  if (!url || !/^https?:\/\//.test(url)) return n;
  if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url)) return { ...n, image: n.uri };
  try {
    const res = path ? await fetchFromGateways(path) : await fetchWithTimeout(url, 12000);
    if (res && res.ok) {
      return await Promise.race([
        parseMeta(n, res),
        new Promise<NftItem>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10000)),
      ]);
    }
  } catch {
    // red o timeout
  }
  // nada respondió: no sabemos si tiene imagen, así que se marca para reintentar
  return { ...n, metaFailed: true };
}

// ───────────────────────────── Envío ─────────────────────────────

/**
 * Fija Sequence (o TicketSequence), Fee, LastLedgerSequence y NetworkID.
 * En multifirma la comisión se multiplica por (1 + N firmantes).
 */
export async function prepareForSigning(
  net: NetworkId,
  tx: TxJson,
  opts: { signerCount: number; validityMinutes: number; ticket?: number },
): Promise<TxJson> {
  const client = await getClient(net);
  const input: TxJson = { ...tx };
  if (opts.ticket) {
    input.Sequence = 0;
    input.TicketSequence = opts.ticket;
  }
  const prepared: TxJson = await client.autofill(input as any, opts.signerCount > 0 ? opts.signerCount : undefined);
  if (opts.ticket) {
    prepared.Sequence = 0;
    prepared.TicketSequence = opts.ticket;
  }
  const ledger = await client.getLedgerIndex();
  prepared.LastLedgerSequence = ledger + Math.max(20, Math.round((opts.validityMinutes * 60) / 3.5));
  if (opts.signerCount > 0) prepared.SigningPubKey = '';
  return prepared;
}

/** Reservas vigentes de la red, en XRP (base por cuenta e incremento por objeto). */
export async function fetchReserves(net: NetworkId): Promise<{ base: number; inc: number }> {
  const client = await getClient(net);
  const server: any = await client.request({ command: 'server_state' } as any);
  const vl = server.result.state.validated_ledger;
  return { base: Number(vl.reserve_base) / 1_000_000, inc: Number(vl.reserve_inc) / 1_000_000 };
}

export async function currentLedger(net: NetworkId): Promise<number> {
  const client = await getClient(net);
  return client.getLedgerIndex();
}

export interface SubmitResult {
  engineResult: string;
  engineMessage?: string;
  validated: boolean;
  finalResult?: string;
  hash: string;
}

export async function submitBlob(net: NetworkId, blob: string, hash: string): Promise<SubmitResult> {
  const client = await getClient(net);
  const res: any = await client.request({ command: 'submit', tx_blob: blob } as any);
  const engine = res.result.engine_result as string;
  // tes/ter/tec: la transacción entra (o puede entrar) a un ledger → hay que esperar la validación.
  // tef/tel/tem: rechazada de inmediato, no se cobra nada y no hay nada que esperar.
  const pending = engine.startsWith('tes') || engine.startsWith('ter') || engine.startsWith('tec') || engine === 'tefPAST_SEQ';
  if (!pending) {
    return { engineResult: engine, engineMessage: res.result.engine_result_message, validated: false, hash };
  }
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    try {
      const t: any = await client.request({ command: 'tx', transaction: hash } as any);
      if (t.result.validated) {
        return { engineResult: engine, engineMessage: res.result.engine_result_message, validated: true, finalResult: t.result.meta?.TransactionResult, hash };
      }
    } catch {}
  }
  return { engineResult: engine, engineMessage: res.result.engine_result_message, validated: false, hash };
}

export async function fundTestnet(address: string): Promise<void> {
  const res = await fetch('https://faucet.altnet.rippletest.net/accounts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ destination: address }),
  });
  if (!res.ok) throw new Error(tl('Faucet respondió {n}', { n: res.status }));
}
