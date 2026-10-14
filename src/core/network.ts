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
      if (tx.SetFlag === 4) title = 'Master key desactivada';
      else if (tx.ClearFlag === 4) title = 'Master key reactivada';
      else {
        const h = HARDENING.find((x) => x.asf === tx.SetFlag);
        if (h) title = h.label;
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

/** Gateways IPFS en orden de preferencia; si uno falla se prueba el siguiente. */
export const IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://nftstorage.link/ipfs/'];

/** Extrae la ruta IPFS (CID + ruta) de cualquier forma común de URI, o null si no es IPFS. */
export function ipfsPath(u?: string): string | null {
  if (!u) return null;
  const t = u.trim();
  if (t.startsWith('ipfs://')) return t.slice(7).replace(/^ipfs\//, '');
  const m = t.match(/\/ipfs\/((?:Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,}).*)$/);
  if (m) return m[1];
  if (/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,})(\/.*)?$/.test(t)) return t;
  return null;
}

/** Convierte una URI de NFT (ipfs://, CID, ar://, https) a URL http con el gateway indicado. */
export function ipfsToHttp(u?: string, gateway = 0): string | undefined {
  if (!u) return undefined;
  const t = u.trim();
  const p = ipfsPath(t);
  if (p) return IPFS_GATEWAYS[Math.min(gateway, IPFS_GATEWAYS.length - 1)] + p;
  if (t.startsWith('ar://')) return 'https://arweave.net/' + t.slice(5);
  return t;
}

export async function fetchNfts(net: NetworkId, address: string): Promise<NftItem[]> {
  const client = await getClient(net);
  let r: any;
  try {
    r = await client.request({ command: 'account_nfts', account: address, limit: 100 } as any);
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return [];
    throw e;
  }
  return r.result.account_nfts.map((n: any) => {
    let uri: string | undefined;
    try {
      uri = n.URI ? convertHexToString(n.URI) : undefined;
    } catch {}
    return { id: n.NFTokenID, issuer: n.Issuer, taxon: n.NFTokenTaxon, serial: n.nft_serial, uri };
  });
}

function pickImage(j: any): string | undefined {
  return j?.image ?? j?.image_url ?? j?.imageUrl ?? j?.properties?.image ?? j?.animation_url ?? j?.content?.url;
}

async function fetchWithTimeout(url: string, ms: number) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, headers: { accept: 'application/json, image/*;q=0.8, */*;q=0.5' } });
  } finally {
    clearTimeout(to);
  }
}

/**
 * Carga la metadata (JSON) de un NFT. Prueba varios gateways IPFS y acepta que la URI
 * apunte directo a una imagen. Nunca lanza: si falla, el NFT se muestra sin imagen.
 */
export async function loadNftMetadata(n: NftItem): Promise<NftItem> {
  if (!n.uri) return n;
  if (n.uri.startsWith('data:image/')) return { ...n, image: n.uri };
  const isIpfs = !!ipfsPath(n.uri);
  const tries = isIpfs ? IPFS_GATEWAYS.length : 1;
  for (let g = 0; g < tries; g++) {
    const url = ipfsToHttp(n.uri, g);
    if (!url || !/^https?:\/\//.test(url)) return n;
    if (/\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(url)) return { ...n, image: n.uri };
    try {
      const res = await fetchWithTimeout(url, 4500);
      if (!res.ok) continue;
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
    } catch {
      // timeout o red: siguiente gateway
    }
  }
  // ningún gateway respondió: no sabemos si tiene imagen, así que se marca para reintentar
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
