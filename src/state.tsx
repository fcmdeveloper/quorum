import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { encode } from 'ripple-binary-codec';
import { hashes } from 'xrpl';
import { AccountState, NetworkId, currentLedger, fetchAccountState, findTxBySequence, prepareForSigning, submitBlob } from './core/network';
import { TURN_USED, classifyUsedTurn } from './core/usedTurn';
import { PriceQuote, fetchXrpPrice } from './core/market';
import { combineSignatures, SignerSig, TxJson } from './core/tx';
import { decodeProposalQr, ledgerTxProposalId, mergeSigs, proposalIdFor } from './core/qr';
import { signAsMaster, signAsMultisigner } from './signers/sign';
import { signWithSecret } from './core/seedVault';
import { SignerDevice } from './signers/types';
import { PendingProposalError } from './core/errors';
import { setHapticsEnabled } from './ui/components';
import { BackupData, MergeResult, mergeBackup } from './core/backup';
import { XamanCreds, XamanAuthError, sessionValid, xamanConnect } from './signers/xaman';
import {
  Account,
  Contact,
  DEFAULT_SETTINGS,
  Proposal,
  Settings,
  loadAccounts,
  loadContacts,
  loadDevices,
  loadProposals,
  loadSettings,
  loadXamanCreds,
  newId,
  saveAccounts,
  saveContacts,
  saveDevices,
  saveProposals,
  saveSettings,
  saveXamanCreds,
  wipeAll,
} from './store';

export const stateKey = (net: NetworkId, address: string) => `${net}:${address}`;

interface AppCtx {
  ready: boolean;
  settings: Settings;
  devices: SignerDevice[];
  accounts: Account[];
  contacts: Contact[];
  proposals: Proposal[];
  xaman: XamanCreds | null;
  price: PriceQuote | null;
  states: Record<string, AccountState | undefined>;
  errors: Record<string, string | undefined>;
  busy: string | null;
  setBusy: (s: string | null) => void;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
  setXaman: (c: XamanCreds | null) => Promise<void>;
  /** Sesión de Xaman válida; si no hay o venció, abre el inicio de sesión. */
  ensureXaman: (onStatus?: (s: string) => void) => Promise<XamanCreds>;
  addDevice: (d: SignerDevice) => Promise<void>;
  updateDevice: (id: string, p: Partial<SignerDevice>) => Promise<void>;
  removeDevice: (id: string) => Promise<void>;
  addAccount: (a: Omit<Account, 'id' | 'createdAt'>) => Promise<Account>;
  updateAccount: (id: string, p: Partial<Account>) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  saveContact: (c: Contact) => Promise<void>;
  removeContact: (id: string) => Promise<void>;
  refreshAccount: (a: Account) => Promise<AccountState | undefined>;
  refreshAll: () => Promise<void>;
  refreshPrice: () => Promise<void>;
  stateOf: (a: Account) => AccountState | undefined;
  /** Estado de cualquier dirección en una red (también de bóvedas que no están en este teléfono). */
  stateAt: (net: NetworkId, address: string) => AccountState | undefined;
  /** Lee del ledger el estado de una dirección que no está en este teléfono (p. ej. la bóveda de una operación recibida por QR). */
  loadRemoteState: (net: NetworkId, address: string) => Promise<AccountState | undefined>;
  deviceFor: (address: string) => SignerDevice | undefined;
  accountFor: (net: NetworkId, address: string) => Account | undefined;
  createProposal: (a: Account, tx: TxJson, opts?: { mode?: 'multi' | 'single'; note?: string }) => Promise<Proposal>;
  importQr: (text: string, meta?: { from?: string; note?: string }) => Promise<{ proposal: Proposal; added: number; isNew: boolean }>;
  signProposal: (id: string, device: SignerDevice) => Promise<void>;
  /** Firma simple con los números secretos de una bóveda creada en Quorum (no se guardan). */
  signProposalWithSecret: (id: string, rows: string[]) => Promise<void>;
  submitProposal: (id: string) => Promise<Proposal>;
  deleteProposal: (id: string) => Promise<void>;
  resetApp: () => Promise<void>;
  /** Datos para exportar (sin sesión de Xaman ni códigos Tangem). */
  backupData: () => BackupData;
  /** Reordena las cuentas de un tipo (bóvedas o cuentas) según `ids`. */
  reorderAccounts: (kind: Account['kind'], ids: string[]) => Promise<void>;
  /** Une un respaldo con lo que ya hay; devuelve cuántas cosas se agregaron. */
  importBackup: (d: BackupData) => Promise<MergeResult['added']>;
}

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp fuera de AppProvider');
  return v;
}

/** Peso total de las firmas reunidas según la lista de firmantes. */
export function signedWeight(sigs: SignerSig[], list?: { entries: { account: string; weight: number }[] } | null): number {
  if (!list) return sigs.length;
  return sigs.reduce((a, s) => a + (list.entries.find((e) => e.account === s.Account)?.weight ?? 0), 0);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [devices, setDevices] = useState<SignerDevice[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [xaman, setXamanState] = useState<XamanCreds | null>(null);
  const [price, setPrice] = useState<PriceQuote | null>(null);
  const [states, setStates] = useState<Record<string, AccountState | undefined>>({});
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const pRef = useRef<Proposal[]>([]);
  const sRef = useRef<Record<string, AccountState | undefined>>({});

  useEffect(() => {
    (async () => {
      const [s, d, a, c, p, x] = await Promise.all([
        loadSettings(),
        loadDevices(),
        loadAccounts(),
        loadContacts(),
        loadProposals(),
        loadXamanCreds(),
      ]);
      setSettings(s);
      setDevices(d);
      setAccounts(a);
      setContacts(c);
      setProposals(p);
      pRef.current = p;
      setXamanState(x);
      setReady(true);
    })();
  }, []);

  const persistProposals = useCallback(async (next: Proposal[]) => {
    pRef.current = next;
    setProposals(next);
    await saveProposals(next);
  }, []);

  const updateSettings = useCallback(async (p: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...p };
      saveSettings(next);
      return next;
    });
  }, []);

  const setXaman = useCallback(async (c: XamanCreds | null) => {
    await saveXamanCreds(c);
    setXamanState(c);
    xRef.current = c;
  }, []);
  const xRef = useRef<XamanCreds | null>(null);
  xRef.current = xaman;
  const busyRef = useRef<string | null>(null);
  busyRef.current = busy;
  const ensureXaman = useCallback(
    async (onStatus?: (s: string) => void) => {
      if (sessionValid(xRef.current)) return xRef.current!;
      // Mientras se inicia sesión la app sale a Xaman y vuelve: marcarla ocupada evita que el
      // bloqueo con Face ID se active a mitad del inicio de sesión (y desmonte la pantalla).
      const mine = !busyRef.current;
      if (mine) setBusy('Conectando con Xaman…');
      try {
        const s = await xamanConnect(onStatus);
        await setXaman(s);
        return s;
      } finally {
        if (mine) setBusy(null);
      }
    },
    [setXaman],
  );

  const addDevice = useCallback(
    async (d: SignerDevice) => {
      if (devices.some((x) => x.address === d.address)) throw new Error('Ya tienes un dispositivo con esa dirección');
      if (accounts.some((a) => a.origin === 'quorum' && a.address === d.address)) {
        throw new Error('Esa dirección es una bóveda creada en Quorum: no puede usarse como dispositivo firmante.');
      }
      const next = [...devices, d];
      setDevices(next);
      await saveDevices(next);
    },
    [devices, accounts],
  );
  const updateDevice = useCallback(
    async (id: string, p: Partial<SignerDevice>) => {
      const next = devices.map((d) => (d.id === id ? { ...d, ...p } : d));
      setDevices(next);
      await saveDevices(next);
    },
    [devices],
  );
  const removeDevice = useCallback(
    async (id: string) => {
      const next = devices.filter((d) => d.id !== id);
      setDevices(next);
      await saveDevices(next);
    },
    [devices],
  );

  const addAccount = useCallback(
    async (a: Omit<Account, 'id' | 'createdAt'>) => {
      if (accounts.some((x) => x.address === a.address && x.network === a.network)) {
        throw new Error('Esa cuenta ya está en Quorum');
      }
      const acc: Account = { ...a, id: newId(), createdAt: Date.now() };
      const next = [...accounts, acc];
      setAccounts(next);
      await saveAccounts(next);
      return acc;
    },
    [accounts],
  );
  const updateAccount = useCallback(
    async (id: string, p: Partial<Account>) => {
      const next = accounts.map((a) => (a.id === id ? { ...a, ...p } : a));
      setAccounts(next);
      await saveAccounts(next);
    },
    [accounts],
  );
  const removeAccount = useCallback(
    async (id: string) => {
      const next = accounts.filter((a) => a.id !== id);
      setAccounts(next);
      await saveAccounts(next);
    },
    [accounts],
  );

  const saveContact = useCallback(
    async (c: Contact) => {
      const next = contacts.some((x) => x.id === c.id) ? contacts.map((x) => (x.id === c.id ? c : x)) : [...contacts, c];
      setContacts(next);
      await saveContacts(next);
    },
    [contacts],
  );
  const removeContact = useCallback(
    async (id: string) => {
      const next = contacts.filter((c) => c.id !== id);
      setContacts(next);
      await saveContacts(next);
    },
    [contacts],
  );

  const markExpired = useCallback(
    async (net: NetworkId, st: AccountState) => {
      if (!st.exists) return;
      let changed = false;
      const next: Proposal[] = [];
      const updated = new Map<string, Proposal>();
      for (const p of pRef.current) {
        if (p.network !== net || p.account !== st.address || !(p.status === 'collecting' || p.status === 'ready')) {
          next.push(p);
          continue;
        }
        const lls = p.tx.LastLedgerSequence;
        const seqUsed = !p.tx.TicketSequence && p.tx.Sequence < st.sequence;
        const ticketUsed = !!p.tx.TicketSequence && !st.tickets.includes(p.tx.TicketSequence);
        if (seqUsed || ticketUsed) {
          // Su secuencia o ticket ya se usó: puede ser esta misma operación, enviada desde otro teléfono.
          const found = p.mode === 'multi' ? await findTxBySequence(net, st.address, { sequence: p.tx.TicketSequence ? undefined : p.tx.Sequence, ticket: p.tx.TicketSequence }).catch(() => null) : null;
          changed = true;
          const u: Proposal = found && ledgerTxProposalId(found.tx) === p.id ? { ...p, status: found.result === 'tesSUCCESS' ? 'submitted' : 'failed', hash: found.hash, result: found.result } : { ...p, status: 'expired' };
          updated.set(p.id, u);
          next.push(u);
          continue;
        }
        if (lls && st.ledgerIndex > lls) {
          changed = true;
          const u: Proposal = { ...p, status: 'expired' };
          updated.set(p.id, u);
          next.push(u);
          continue;
        }
        next.push(p);
      }
      // las operaciones pudieron cambiar mientras se consultaba el ledger: solo se actualizan las revisadas
      if (changed) await persistProposals(pRef.current.map((p) => updated.get(p.id) ?? p));
    },
    [persistProposals],
  );

  const refreshAccount = useCallback(
    async (a: Account) => {
      const key = stateKey(a.network, a.address);
      try {
        const st = await fetchAccountState(a.network, a.address);
        sRef.current = { ...sRef.current, [key]: st };
        setStates(sRef.current);
        setErrors((e) => ({ ...e, [key]: undefined }));
        await markExpired(a.network, st);
        // Una cuenta normal a la que se le configuró multifirma (en Quorum o en otra app)
        // pasa sola a mostrarse como bóveda.
        if (st.signerList && a.kind === 'wallet') {
          setAccounts((prev) => {
            const next = prev.map((x) => (x.id === a.id ? { ...x, kind: 'vault' as const, allowed: x.allowed ?? [] } : x));
            saveAccounts(next);
            return next;
          });
        }
        return st;
      } catch (e: any) {
        setErrors((x) => ({ ...x, [key]: e?.message ?? String(e) }));
        return undefined;
      }
    },
    [markExpired],
  );

  const refreshPrice = useCallback(async () => {
    try {
      setPrice(await fetchXrpPrice());
    } catch {}
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([refreshPrice(), ...accounts.map((a) => refreshAccount(a))]);
  }, [accounts, refreshAccount, refreshPrice]);

  useEffect(() => {
    if (!ready) return;
    refreshAll();
    const t = setInterval(refreshPrice, 60_000);
    return () => clearInterval(t);
  }, [ready, accounts.length]);

  const stateOf = useCallback((a: Account) => states[stateKey(a.network, a.address)], [states]);
  const stateAt = useCallback((net: NetworkId, address: string) => states[stateKey(net, address)], [states]);
  const loadRemoteState = useCallback(async (net: NetworkId, address: string) => {
    const key = stateKey(net, address);
    try {
      const st = await fetchAccountState(net, address);
      sRef.current = { ...sRef.current, [key]: st };
      setStates(sRef.current);
      await markExpired(net, st);
      return st;
    } catch {
      return sRef.current[key];
    }
  }, [markExpired]);
  const deviceFor = useCallback((address: string) => devices.find((d) => d.address === address), [devices]);
  const accountFor = useCallback(
    (net: NetworkId, address: string) => accounts.find((a) => a.network === net && a.address === address),
    [accounts],
  );

  const createProposal = useCallback(
    async (a: Account, tx: TxJson, opts: { mode?: 'multi' | 'single'; note?: string } = {}) => {
      const st = await refreshAccount(a);
      if (!st) throw new Error('No se pudo leer la cuenta en la red');
      if (!st.exists) throw new Error('La cuenta aún no existe en la red: envíale XRP para activarla');
      const mode = opts.mode ?? (st.signerList ? 'multi' : 'single');
      if (mode === 'single' && st.masterDisabled && !st.regularKey) throw new Error('La master key está desactivada: usa multifirma');
      if (mode === 'multi' && !st.signerList) throw new Error('Esta cuenta no tiene lista de firmantes');
      // Bóveda creada en Quorum en preparación: solo los pasos de configuración.
      const acc = accounts.find((x) => x.network === a.network && x.address === a.address) ?? a;
      if (acc.origin === 'quorum' && !st.masterDisabled && !['SignerListSet', 'AccountSet', 'TicketCreate'].includes(tx.TransactionType)) {
        throw new Error('Esta bóveda todavía está en preparación: termina su configuración (prueba con multifirma y desactivar la master key) antes de usarla.');
      }
      if (acc.origin === 'quorum' && tx.TransactionType === 'AccountSet' && tx.ClearFlag === 4) {
        throw new Error('Regla de Quorum: esta bóveda se creó en Quorum y su master key no se puede reactivar.');
      }

      // Tickets libres → propuestas en paralelo sin conflicto
      let ticket: number | undefined;
      if (mode === 'multi' && st.tickets.length) {
        const used = new Set(
          pRef.current
            .filter((p) => p.account === a.address && p.network === a.network && (p.status === 'collecting' || p.status === 'ready'))
            .map((p) => p.tx.TicketSequence)
            .filter(Boolean),
        );
        ticket = st.tickets.find((t) => !used.has(t));
      }
      if (!ticket) {
        const clash = pRef.current.find(
          (p) =>
            p.account === a.address &&
            p.network === a.network &&
            (p.status === 'collecting' || p.status === 'ready') &&
            !p.tx.TicketSequence,
        );
        if (clash) throw new PendingProposalError(clash.id);
      }

      const prepared = await prepareForSigning(a.network, tx, {
        signerCount: mode === 'multi' ? st.signerList!.entries.length : 0,
        validityMinutes: settings.validityMinutes,
        ticket,
      });
      const p: Proposal = {
        id: mode === 'multi' ? proposalIdFor(prepared) : newId(),
        network: a.network,
        account: a.address,
        createdAt: Date.now(),
        mode,
        tx: prepared,
        signatures: [],
        status: 'collecting',
        note: opts.note,
      };
      await persistProposals([p, ...pRef.current]);
      return p;
    },
    [accounts, refreshAccount, settings.validityMinutes, persistProposals],
  );

  const statusFor = (p: Proposal, sigs: SignerSig[]): Proposal['status'] => {
    const st = sRef.current[stateKey(p.network, p.account)];
    if (st?.signerList && signedWeight(sigs, st.signerList) >= st.signerList.quorum) return 'ready';
    return 'collecting';
  };

  const importQr = useCallback(
    async (text: string, meta?: { from?: string; note?: string }) => {
      const d = decodeProposalQr(text);
      const existing = pRef.current.find((p) => p.id === d.id);
      const acc = accounts.find((a) => a.network === d.network && a.address === d.tx.Account);
      // Lo normal es que el teléfono que firma no tenga la bóveda: sus firmantes y quórum se leen del ledger.
      if (acc) await refreshAccount(acc);
      else await loadRemoteState(d.network, d.tx.Account);
      if (existing) {
        const before = existing.signatures.length;
        const sigs = mergeSigs(existing.signatures, d.signatures);
        const status = existing.status === 'submitted' ? 'submitted' : statusFor(existing, sigs);
        const upd: Proposal = { ...existing, signatures: sigs, status, sharedFrom: existing.sharedFrom ?? meta?.from, sharedNote: existing.sharedNote ?? meta?.note };
        await persistProposals(pRef.current.map((p) => (p.id === existing.id ? upd : p)));
        return { proposal: upd, added: sigs.length - before, isNew: false };
      }
      const base: Proposal = {
        id: d.id,
        network: d.network,
        account: d.tx.Account,
        createdAt: Date.now(),
        mode: 'multi',
        tx: d.tx,
        signatures: d.signatures,
        status: 'collecting',
        sharedFrom: meta?.from,
        sharedNote: meta?.note,
      };
      const p = { ...base, status: statusFor(base, d.signatures) };
      await persistProposals([p, ...pRef.current]);
      return { proposal: p, added: d.signatures.length, isNew: true };
    },
    [accounts, refreshAccount, loadRemoteState, persistProposals],
  );

  const signOnce = useCallback(
    async (p: Proposal, device: SignerDevice, ctx: Parameters<typeof signAsMaster>[2]) => {
      {
        if (p.mode === 'single') {
          const signed = await signAsMaster(device, p.tx, ctx);
          await persistProposals(
            pRef.current.map((x) => (x.id === p.id ? { ...x, status: 'ready', hash: signed.hash, tx: signed.tx } : x)),
          );
        } else {
          if (p.signatures.some((s) => s.Account === device.address)) throw new Error('Este dispositivo ya firmó');
          const sig = await signAsMultisigner(device, p.tx, ctx);
          const sigs = [...p.signatures, sig];
          await persistProposals(
            pRef.current.map((x) => (x.id === p.id ? { ...x, signatures: sigs, status: statusFor(x, sigs) } : x)),
          );
        }
      }
    },
    [persistProposals],
  );

  const signProposal = useCallback(
    async (id: string, device: SignerDevice) => {
      const p = pRef.current.find((x) => x.id === id);
      if (!p) throw new Error('Propuesta no encontrada');
      const ledger = await currentLedger(p.network);
      if (p.tx.LastLedgerSequence && ledger > p.tx.LastLedgerSequence) {
        await persistProposals(pRef.current.map((x) => (x.id === p.id ? { ...x, status: 'expired' } : x)));
        throw new Error('La propuesta venció. Crea una nueva.');
      }
      const onStatus = (s: string) => setBusy(s);
      const ctx = { xamanSession: () => ensureXaman(onStatus), onStatus, network: p.network };
      setBusy('Preparando firma…');
      try {
        const hadSession = sessionValid(xRef.current);
        await signOnce(p, device, ctx).catch(async (e) => {
          // Xaman rechazó una sesión GUARDADA: se borra, se inicia sesión de nuevo y se reintenta una vez.
          // Si la sesión recién se obtuvo, no se reintenta (sería pedir otro inicio de sesión igual).
          if (!(e instanceof XamanAuthError) || !hadSession) throw e;
          await setXaman(null);
          xRef.current = null;
          await signOnce(p, device, ctx);
        });
      } catch (e) {
        if (e instanceof XamanAuthError) await setXaman(null);
        throw e;
      } finally {
        setBusy(null);
      }
    },
    [ensureXaman, setXaman, persistProposals, signOnce],
  );

  const signProposalWithSecret = useCallback(
    async (id: string, rows: string[]) => {
      const p = pRef.current.find((x) => x.id === id);
      if (!p) throw new Error('Propuesta no encontrada');
      if (p.mode !== 'single') throw new Error('Los números secretos solo firman operaciones simples de la bóveda');
      const ledger = await currentLedger(p.network);
      if (p.tx.LastLedgerSequence && ledger > p.tx.LastLedgerSequence) {
        await persistProposals(pRef.current.map((x) => (x.id === p.id ? { ...x, status: 'expired' } : x)));
        throw new Error('La propuesta venció. Crea una nueva.');
      }
      const signed = signWithSecret(p.tx, rows);
      await persistProposals(pRef.current.map((x) => (x.id === p.id ? { ...x, status: 'ready', hash: signed.hash, tx: signed.tx } : x)));
    },
    [persistProposals],
  );

  const submitProposal = useCallback(
    async (id: string) => {
      const p = pRef.current.find((x) => x.id === id);
      if (!p) throw new Error('Propuesta no encontrada');
      setBusy('Enviando a la red…');
      try {
        const ledger = await currentLedger(p.network);
        if (p.tx.LastLedgerSequence && ledger > p.tx.LastLedgerSequence) {
          const exp: Proposal = { ...p, status: 'expired' };
          await persistProposals(pRef.current.map((x) => (x.id === p.id ? exp : x)));
          throw new Error('La operación venció antes de enviarse. Crea una nueva y envíala apenas tenga las firmas.');
        }
        let blob: string;
        let hash: string;
        if (p.mode === 'single') {
          if (!p.tx.TxnSignature) throw new Error('Falta la firma');
          blob = encode(p.tx as any);
          hash = hashes.hashSignedTx(blob);
        } else {
          const st = await fetchAccountState(p.network, p.account);
          if (!st.signerList) throw new Error('La cuenta ya no tiene lista de firmantes');
          const c = combineSignatures(p.tx, p.signatures, st.signerList);
          blob = c.blob;
          hash = c.hash;
        }
        setBusy('Esperando validación del ledger…');
        const r = await submitBlob(p.network, blob, hash);
        if (!r.validated && TURN_USED.has(r.engineResult) && p.mode === 'multi') {
          // ¿La envió otro teléfono? Se busca qué transacción usó esa secuencia o ese ticket.
          const found = await findTxBySequence(p.network, p.account, { sequence: p.tx.TicketSequence ? undefined : p.tx.Sequence, ticket: p.tx.TicketSequence }).catch(() => null);
          const u = classifyUsedTurn(p.id, found);
          if (u.kind === 'elsewhere') {
            const done: Proposal = { ...p, hash: u.hash, status: u.result === 'tesSUCCESS' ? 'submitted' : 'failed', result: u.result, resultMessage: undefined, sentElsewhere: true };
            await persistProposals(pRef.current.map((x) => (x.id === p.id ? done : x)));
            const acc = accounts.find((a) => a.network === p.network && a.address === p.account);
            if (acc) refreshAccount(acc);
            return done;
          }
          if (u.kind === 'other') {
            const exp: Proposal = { ...p, status: 'expired', result: r.engineResult, resultMessage: 'Otra operación usó ese turno' };
            await persistProposals(pRef.current.map((x) => (x.id === p.id ? exp : x)));
            return exp;
          }
        }
        const ok = r.validated && r.finalResult === 'tesSUCCESS';
        const upd: Proposal = {
          ...p,
          hash,
          status: ok ? 'submitted' : r.validated ? 'failed' : p.status,
          result: r.finalResult ?? r.engineResult,
          resultMessage: r.validated ? undefined : r.engineMessage,
        };
        await persistProposals(pRef.current.map((x) => (x.id === p.id ? upd : x)));
        const acc = accounts.find((a) => a.network === p.network && a.address === p.account);
        if (acc) refreshAccount(acc);
        return upd;
      } finally {
        setBusy(null);
      }
    },
    [accounts, persistProposals, refreshAccount],
  );

  const deleteProposal = useCallback(
    async (id: string) => persistProposals(pRef.current.filter((p) => p.id !== id)),
    [persistProposals],
  );

  useEffect(() => {
    setHapticsEnabled(settings.haptics !== false);
  }, [settings.haptics]);

  const reorderAccounts = useCallback(
    async (kind: Account['kind'], ids: string[]) => {
      const ofKind = ids.map((id) => accounts.find((a) => a.id === id)).filter(Boolean) as Account[];
      const others = accounts.filter((a) => a.kind !== kind);
      const next = kind === 'vault' ? [...ofKind, ...others] : [...others, ...ofKind];
      setAccounts(next);
      await saveAccounts(next);
    },
    [accounts],
  );

  const backupData = useCallback(
    (): BackupData => ({ devices, accounts, contacts, proposals: pRef.current, settings }),
    [devices, accounts, contacts, settings],
  );

  const importBackup = useCallback(
    async (d: BackupData) => {
      const m = mergeBackup({ devices, accounts, contacts, proposals: pRef.current }, d);
      setDevices(m.data.devices);
      await saveDevices(m.data.devices);
      setAccounts(m.data.accounts);
      await saveAccounts(m.data.accounts);
      setContacts(m.data.contacts);
      await saveContacts(m.data.contacts);
      await persistProposals(m.data.proposals);
      // ajustes visuales solo si este teléfono está recién instalado (sin cuentas)
      if (accounts.length === 0) {
        setSettings((prev) => {
          const next = { ...prev, ...d.settings };
          saveSettings(next);
          return next;
        });
      }
      for (const a of m.data.accounts) refreshAccount(a);
      return m.added;
    },
    [devices, accounts, contacts, persistProposals, refreshAccount],
  );

  const resetApp = useCallback(async () => {
    await wipeAll();
    setSettings(DEFAULT_SETTINGS);
    setDevices([]);
    setAccounts([]);
    setContacts([]);
    setProposals([]);
    pRef.current = [];
    setXamanState(null);
    setStates({});
  }, []);

  const value: AppCtx = {
    ready,
    settings,
    devices,
    accounts,
    contacts,
    proposals,
    xaman,
    price,
    states,
    errors,
    busy,
    setBusy,
    updateSettings,
    setXaman,
    ensureXaman,
    addDevice,
    updateDevice,
    removeDevice,
    addAccount,
    updateAccount,
    removeAccount,
    saveContact,
    removeContact,
    refreshAccount,
    refreshAll,
    refreshPrice,
    stateOf,
    stateAt,
    loadRemoteState,
    deviceFor,
    accountFor,
    createProposal,
    importQr,
    signProposal,
    signProposalWithSecret,
    submitProposal,
    deleteProposal,
    resetApp,
    backupData,
    reorderAccounts,
    importBackup,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
