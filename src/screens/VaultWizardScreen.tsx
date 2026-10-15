import React, { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { isValidClassicAddress } from 'ripple-address-codec';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useAddressScanner } from '../ui/ScanView';
import { Badge, BusySheet, Button, Card, Field, ListItem, Notice, QuorumRing, Screen, Segmented, Stepper, Txt, success, warnBuzz } from '../ui/components';
import { C, SP } from '../ui/theme';
import { NetworkId, fetchAccountState, fetchReserves, fundTestnet } from '../core/network';
import { HARDENING, TxJson, buildSetFlag, buildSignerListSet, buildTicketCreate } from '../core/tx';
import { lossTolerance, minSigners } from '../core/health';
import { KIND_LABEL } from '../signers/types';
import { Account, newId } from '../store';
import { Reserves, addressFromSecret, generateSecret, setupBalanceLimitXrp, setupMinimumXrp, signerProblem } from '../core/seedVault';
import { CheckRow, SecretEntrySheet, SecretGrid, useNoScreenCapture } from '../ui/secret';

type Step = 'base' | 'secret' | 'signers' | 'protect' | 'run';
/** Cómo se firma la configuración: números secretos, el dispositivo creador o el quórum. */
type How = 'secret' | 'master' | 'multi';

interface Pick {
  address: string;
  weight: number;
  label: string;
  external?: boolean;
}

export default function VaultWizardScreen({ id }: { id?: string }) {
  const app = useApp();
  const nav = useNav();
  const scanner = useAddressScanner();
  const found = id ? app.accounts.find((a) => a.id === id) : undefined;
  // Una bóveda creada en Quorum que aún no tiene firmantes retoma la configuración completa.
  const resuming = !!found && found.origin === 'quorum' && !app.stateOf(found)?.signerList;
  const editing = resuming ? undefined : found;
  const [step, setStep] = useState<Step>(found ? 'signers' : 'base');

  // paso base
  const [name, setName] = useState('Bóveda principal');
  const [network, setNetwork] = useState<NetworkId>('testnet');
  const [masterId, setMasterId] = useState<string | null>(null);
  const [vault, setVault] = useState<Account | undefined>(found);
  // 'new': cuenta nueva creada en Quorum; 'device': una cuenta de mis dispositivos
  const [mode, setMode] = useState<'new' | 'device'>('new');
  const [secret, setSecret] = useState<string[] | null>(null);
  const [ackWritten, setAckWritten] = useState(false);
  const [ackMinimum, setAckMinimum] = useState(false);
  const [ackNoReturn, setAckNoReturn] = useState(false);
  const [reserves, setReserves] = useState<Reserves | null>(null);
  useNoScreenCapture(step === 'secret', 'secret-show');

  // firmantes
  const st = vault ? app.stateOf(vault) : undefined;
  const [picks, setPicks] = useState<Pick[]>([]);
  const [quorum, setQuorum] = useState(2);
  const [extAddr, setExtAddr] = useState('');
  const [extName, setExtName] = useState('');

  // protección
  const [harden, setHarden] = useState(true);
  const [tickets, setTickets] = useState(true);

  // ejecución
  const [plan, setPlan] = useState<{ tx: TxJson; label: string; state: 'wait' | 'run' | 'ok' | 'err'; msg?: string }[]>([]);
  const [running, setRunning] = useState(false);
  const [how, setHow] = useState<How>('multi');
  const [askSecret, setAskSecret] = useState(false);
  const [checking, setChecking] = useState(false);

  const created = vault?.origin === 'quorum';
  const net = vault?.network ?? network;
  useEffect(() => {
    let alive = true;
    fetchReserves(net)
      .then((r) => alive && setReserves(r))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [net]);
  const minXrp = setupMinimumXrp(reserves ?? { base: 1, inc: 0.2 }, tickets ? 5 : 0);
  const limitXrp = setupBalanceLimitXrp(reserves ?? { base: 1, inc: 0.2 }, tickets ? 5 : 0);
  const overLimit = created && !!st?.exists && !st.masterDisabled && Number(st.balanceXrp) > limitXrp;


  useEffect(() => {
    if (editing && st?.signerList && picks.length === 0) {
      setPicks(
        st.signerList.entries.map((e) => ({
          address: e.account,
          weight: e.weight,
          label: app.deviceFor(e.account)?.label ?? app.contacts.find((c) => c.address === e.account)?.label ?? 'Firmante externo',
          external: !app.deviceFor(e.account),
        })),
      );
      setQuorum(st.signerList.quorum);
    }
  }, [editing, st?.signerList]);

  const vaultAddr = vault?.address ?? app.devices.find((d) => d.id === masterId)?.address;
  const quorumVault = (address: string) => app.accounts.some((a) => a.origin === 'quorum' && a.address === address);
  const candidates = app.devices.filter((d) => d.address !== vaultAddr && !quorumVault(d.address));
  const total = picks.reduce((a, p) => a + p.weight, 0);
  const list = { quorum, entries: picks.map((p) => ({ account: p.address, weight: p.weight })) };
  const need = picks.length ? minSigners(list) : 0;
  const tol = picks.length ? lossTolerance(list) : 0;

  const togglePick = (address: string, label: string) => {
    setPicks((ps) => (ps.some((p) => p.address === address) ? ps.filter((p) => p.address !== address) : [...ps, { address, label, weight: 1 }]));
  };

  // ── Paso 1: crear la cuenta bóveda
  /** Bóvedas (de esa red) donde esta dirección ya es firmante. */
  const signerElsewhere = (address: string) =>
    app.accounts.filter((a) => a.kind === 'vault' && a.network === network && app.stateOf(a)?.signerList?.entries.some((e) => e.account === address));

  const startNew = () => {
    try {
      setSecret(generateSecret());
      setAckWritten(false);
      setAckMinimum(false);
      setAckNoReturn(false);
      setStep('secret');
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message);
    }
  };

  const confirmSecret = async () => {
    if (!secret) return;
    try {
      const address = addressFromSecret(secret);
      const acc = await app.addAccount({ label: name.trim() || 'Bóveda', kind: 'vault', network, address, allowed: [], origin: 'quorum' });
      setSecret(null);
      setVault(acc);
      await app.refreshAccount(acc);
      setStep('signers');
    } catch (e: any) {
      Alert.alert('No se pudo crear', e.message);
    }
  };

  /** Revisa en la red que cada firmante elegido pueda firmar de verdad. */
  const checkSigners = async (): Promise<boolean> => {
    setChecking(true);
    try {
      const problems: string[] = [];
      for (const p of picks) {
        const st2 = await fetchAccountState(net, p.address).catch(() => undefined);
        const why = signerProblem(st2, quorumVault(p.address));
        if (why) problems.push(`${p.label}: ${t(why)}`);
      }
      if (problems.length) {
        Alert.alert('Firmante no válido', problems.join('\n\n'));
        return false;
      }
      return true;
    } finally {
      setChecking(false);
    }
  };

  const createVault = async () => {
    if (mode === 'new') return startNew();
    const dev = app.devices.find((d) => d.id === masterId);
    if (!dev) return;
    const go = async () => {
      try {
        const existing = app.accounts.find((a) => a.address === dev.address && a.network === network);
        let acc: Account;
        if (existing) {
          // una cuenta normal que se convierte en bóveda: misma dirección, mismos fondos
          acc = { ...existing, kind: 'vault', label: name.trim() || existing.label };
          await app.updateAccount(existing.id, { kind: 'vault', label: acc.label });
        } else {
          acc = await app.addAccount({ label: name.trim() || 'Bóveda', kind: 'vault', network, address: dev.address, allowed: [] });
        }
        setVault(acc);
        await app.refreshAccount(acc);
        setStep('signers');
      } catch (e: any) {
        Alert.alert('No se pudo crear', e.message);
      }
    };
    const others = signerElsewhere(dev.address);
    if (others.length) {
      return Alert.alert(
        'Ojo: ya es firmante',
        t('{d} es firmante de {v}. Cuando esta nueva bóveda desactive su master key, {d} ya no podrá firmar en esas bóvedas. Usa otro dispositivo para crear esta bóveda, o cámbialo antes en esas bóvedas.', { d: dev.label, v: others.map((o) => `“${o.label}”`).join(', ') }),
        [
          { text: 'Elegir otro', style: 'cancel' },
          { text: 'Continuar igual', style: 'destructive', onPress: go },
        ],
      );
    }
    return go();
  };

  // ── Paso final: ejecutar
  const buildPlan = () => {
    const items: { tx: TxJson; label: string; state: 'wait' }[] = [];
    items.push({ tx: buildSignerListSet(vault!.address, quorum, list.entries), label: t('Multifirma {a} de {b}', { a: need, b: picks.length }), state: 'wait' });
    if (harden) {
      for (const h of HARDENING) {
        if (!st?.hardening.find((x) => x.asf === h.asf)?.on) items.push({ tx: buildSetFlag(vault!.address, h.asf), label: h.label, state: 'wait' });
      }
    }
    if (tickets && (st?.tickets.length ?? 0) < 3) items.push({ tx: buildTicketCreate(vault!.address, 5), label: 'Crear 5 tickets (firmas en paralelo)', state: 'wait' });
    return items;
  };

  const goReview = async () => {
    try {
      if (!(await checkSigners())) return;
      const p = buildPlan();
      const md = vault ? app.deviceFor(vault.address) : undefined;
      setHow(created && st && !st.masterDisabled && !st.signerList ? 'secret' : st && !st.masterDisabled && md ? 'master' : 'multi');
      setPlan(p);
      setStep('run');
    } catch (e: any) {
      Alert.alert('Revisa la configuración', e.message);
    }
  };

  const masterDevice = vault ? app.deviceFor(vault.address) : undefined;
  const useMaster = how !== 'multi';

  const run = async () => {
    if (!vault) return;
    if (how === 'secret') {
      if (overLimit) {
        return Alert.alert(
          'Tiene más de lo necesario',
          t('Esta bóveda tiene {b} XRP y aún no está protegida: mientras la master key esté activa, quien tenga los números secretos controla todo. Lo recomendado es tener solo unos {m} XRP hasta terminar.', { b: st!.balanceXrp, m: minXrp }),
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Entiendo el riesgo, continuar', style: 'destructive', onPress: () => setAskSecret(true) },
          ],
        );
      }
      return setAskSecret(true);
    }
    return runPlan();
  };

  const runPlan = async (rows?: string[]) => {
    if (!vault) return;
    setRunning(true);
    const items = [...plan];
    try {
      if (how === 'multi') {
        // la bóveda ya es multifirma: se crea una propuesta y se juntan firmas
        const p = await app.createProposal(vault, items[0].tx, { mode: 'multi' });
        nav.replace('proposal', { id: p.id });
        return;
      }
      for (let i = 0; i < items.length; i++) {
        if (items[i].state === 'ok') continue;
        items[i] = { ...items[i], state: 'run' };
        setPlan([...items]);
        const p = await app.createProposal(vault, items[i].tx, { mode: 'single' });
        if (how === 'secret') await app.signProposalWithSecret(p.id, rows!);
        else await app.signProposal(p.id, masterDevice!);
        const r = await app.submitProposal(p.id);
        if (r.status !== 'submitted') {
          items[i] = { ...items[i], state: 'err', msg: r.result };
          setPlan([...items]);
          throw new Error(t('Falló: {x} ({r})', { x: items[i].label, r: r.result ?? '' }));
        }
        items[i] = { ...items[i], state: 'ok' };
        setPlan([...items]);
      }
      success();
      await app.refreshAccount(vault);
    } catch (e: any) {
      warnBuzz();
      Alert.alert('Se detuvo', `${t(String(e?.message ?? e))}\n\n${t('Puedes reintentar: lo ya confirmado no se repite.')}`);
      setPlan((ps) => ps.map((x) => (x.state === 'run' ? { ...x, state: 'err' } : x)));
    } finally {
      setRunning(false);
    }
  };

  const allDone = plan.length > 0 && plan.every((p) => p.state === 'ok');

  return (
    <Screen title={editing ? 'Firmantes de la bóveda' : 'Nueva bóveda'} onBack={nav.pop} scrollKey={step}>
      <BusySheet visible={!!app.busy} text={app.busy ?? ''} />
      {!editing && (
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: SP.xl }}>
          {(['base', 'signers', 'protect', 'run'] as Step[]).map((s, i) => (
            <View key={s} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: ['base', 'signers', 'protect', 'run'].indexOf(step === 'secret' ? 'base' : step) >= i ? C.green : C.line }} />
          ))}
        </View>
      )}

      {step === 'base' && (
        <>
          <Txt v="h1">Crea tu bóveda</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.xl }}>
            Una bóveda es una cuenta del XRP Ledger que solo se mueve con varias firmas. Al final, su clave original se desactiva y solo el quórum la controla.
          </Txt>
          <Field label="Nombre" value={name} onChangeText={setName} />
          <Txt v="label" style={{ marginBottom: 6 }}>
            Red
          </Txt>
          <Segmented
            value={network}
            onChange={setNetwork}
            options={[
              { value: 'testnet', label: 'Testnet (ensayo)' },
              { value: 'mainnet', label: 'Mainnet' },
            ]}
          />
          {network === 'mainnet' && <Notice>Primero haz el ensayo completo en testnet. En mainnet los fondos son reales.</Notice>}
          <Button title={network === 'testnet' ? '¿Primera vez? Mira la guía de ensayo' : 'Ver la guía de ensayo en testnet'} kind="ghost" icon="book-open" onPress={() => nav.push('guide', {})} />
          <Txt v="label" style={{ marginTop: SP.md, marginBottom: 6 }}>
            Cuenta de la bóveda
          </Txt>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'new', label: 'Cuenta nueva' },
              { value: 'device', label: 'Una de mis cuentas' },
            ]}
          />
          {mode === 'new' ? (
            <Card>
              <Txt v="h3">Cuenta nueva creada en Quorum</Txt>
              <Txt v="small" style={{ marginTop: 6 }}>
                Quorum crea una cuenta nueva y te muestra sus números secretos para que los anotes. No los guarda: te los pedirá para configurar la bóveda y para desactivar su clave original. Sirve con cualquier firmante, incluido Xaman.
              </Txt>
            </Card>
          ) : (
            <Txt v="small" style={{ marginBottom: SP.sm }}>
              La cuenta de uno de tus dispositivos se convierte en bóveda: misma dirección y mismos fondos.
            </Txt>
          )}
          {mode === 'device' && app.devices.length === 0 && (
            <Card>
              <Txt v="body">Primero registra tus dispositivos.</Txt>
              <Button title="Agregar dispositivo" kind="secondary" icon="plus" onPress={() => nav.push('devices', {})} />
            </Card>
          )}
          {mode === 'device' && app.devices.map((d) => {
            const on = masterId === d.id;
            const existing = app.accounts.find((a) => a.address === d.address && a.network === network);
            // Xaman no deja que apps externas firmen SignerListSet: sus cuentas no se pueden convertir desde Quorum
            const used = existing?.kind === 'vault' || d.kind === 'xaman';
            const signer = signerElsewhere(d.address).length > 0;
            const sub = d.kind === 'xaman'
              ? 'Xaman no permite que otras apps configuren la multifirma de sus cuentas. Usa "Cuenta nueva".'
              : used
              ? 'Ya es una bóveda en Quorum'
              : existing
                ? t('Tu cuenta “{x}” se convertirá en bóveda (mismos fondos)', { x: existing.label })
                : `${KIND_LABEL[d.kind]} · ${d.address.slice(0, 6)}…${d.address.slice(-4)}${signer ? ' · ' + t('ya es firmante de otra bóveda') : ''}`;
            return (
              <Card key={d.id} onPress={used ? undefined : () => setMasterId(d.id)} style={{ borderColor: on ? C.green : C.line, opacity: used ? 0.4 : 1, paddingVertical: 6 }}>
                <ListItem
                  icon={d.kind === 'ledger' ? 'cpu' : d.kind === 'tangem' ? 'credit-card' : 'smartphone'}
                  title={d.label}
                  subtitle={sub}
                  right={on ? <Feather name="check-circle" size={20} color={C.green} /> : undefined}
                />
              </Card>
            );
          })}
          {mode === 'device' && masterId && <Notice kind="info">Este dispositivo no podrá ser firmante de esta bóveda. Elige otros para la multifirma.</Notice>}
          <Button title="Continuar" onPress={createVault} disabled={(mode === 'device' && !masterId) || !name.trim()} />
        </>
      )}

      {step === 'secret' && secret && (
        <>
          <Txt v="h1">Tus números secretos</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.lg }}>
            Anótalos en papel, en orden. Son la clave de emergencia de esta bóveda. Quorum no los guarda: te los pedirá para configurarla y para desactivar su clave original.
          </Txt>
          <SecretGrid rows={secret} />
          <Notice kind="bad">
            No les saques foto ni los guardes en el teléfono o en la nube. Cuando la bóveda esté lista no sirven para mover fondos, pero vuelven a valer si algún día se reactiva su master key.
          </Notice>
          <CheckRow on={ackWritten} onChange={setAckWritten} text="Los anoté en papel, en orden." />
          <CheckRow
            on={ackMinimum}
            onChange={setAckMinimum}
            text={t('Enviaré solo lo mínimo (unos {m} XRP) hasta que la master key esté desactivada y haya probado una operación con multifirma.', { m: minXrp })}
          />
          <CheckRow
            on={ackNoReturn}
            onChange={setAckNoReturn}
            text="Entiendo que esta bóveda no podrá volver a cuenta normal en Quorum, y que para salir debo mover los fondos con multifirma."
          />
          <Button title="Continuar" onPress={confirmSecret} disabled={!ackWritten || !ackMinimum || !ackNoReturn} />
          <Button
            title="Volver"
            kind="ghost"
            onPress={() => {
              setSecret(null);
              setStep('base');
            }}
          />
        </>
      )}

      {step === 'signers' && vault && (
        <>
          {st && !st.exists && (
            <Card style={{ borderColor: C.warn + '55' }}>
              <Txt v="h3">Activa la bóveda</Txt>
              <Txt v="small" style={{ marginVertical: 6 }}>
                {created
                  ? t('Envíale solo unos {m} XRP a {a}… (reserva, firmantes, tickets y comisiones). No envíes más hasta que la bóveda esté lista.', { m: minXrp, a: vault.address.slice(0, 8) })
                  : t('Envíale XRP a {a}… para que exista en la red (reserva + comisiones; unos {m} XRP alcanzan).', { a: vault.address.slice(0, 8), m: minXrp })}
              </Txt>
              {vault.network === 'testnet' ? (
                <Button
                  title="Pedir XRP de prueba"
                  icon="droplet"
                  kind="secondary"
                  onPress={async () => {
                    try {
                      await fundTestnet(vault.address);
                      setTimeout(() => app.refreshAccount(vault), 5000);
                    } catch (e: any) {
                      Alert.alert('Faucet', e.message);
                    }
                  }}
                />
              ) : (
                <Button title="Ver dirección para recibir" kind="secondary" icon="arrow-down-left" onPress={() => nav.push('receive', { id: vault.id })} />
              )}
              <Button title="Ya la fondeé, actualizar" kind="ghost" onPress={() => app.refreshAccount(vault)} />
            </Card>
          )}

          {overLimit && (
            <Notice kind="bad">
              {t('Esta bóveda tiene {b} XRP y todavía no está protegida. Lo recomendado son unos {m} XRP hasta desactivar la master key y probar la multifirma.', { b: st!.balanceXrp, m: minXrp })}
            </Notice>
          )}
          <View style={{ alignItems: 'center', marginVertical: SP.lg }}>
            <QuorumRing
              size={132}
              segments={picks.length ? picks.map((p) => ({ weight: p.weight, on: true })) : [{ weight: 1, on: false }]}
              center={picks.length && Number.isFinite(need) ? `${need}/${picks.length}` : '—'}
              sub="dispositivos"
            />
            <Txt v="body" style={{ marginTop: SP.md, textAlign: 'center' }}>
              {picks.length === 0
                ? 'Elige al menos dos firmantes'
                : !Number.isFinite(need)
                  ? 'El quórum es mayor que la suma de pesos'
                  : t('Se necesitan {n} para mover fondos · puedes perder {m}', { n: need, m: tol })}
            </Txt>
          </View>

          <Txt v="label" style={{ marginBottom: 6 }}>
            Firmantes
          </Txt>
          {candidates.map((d) => {
            const p = picks.find((x) => x.address === d.address);
            return (
              <Card key={d.id} style={{ paddingVertical: 10, borderColor: p ? C.green + '66' : C.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
                  <Pressable onPress={() => togglePick(d.address, d.label)} style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md, flex: 1 }}>
                    <Feather name={p ? 'check-square' : 'square'} size={22} color={p ? C.green : C.faint} />
                    <View style={{ flex: 1 }}>
                      <Txt v="body" numberOfLines={1}>
                        {d.label}
                      </Txt>
                      <Txt v="small" numberOfLines={1}>
                        {KIND_LABEL[d.kind]} · {d.address.slice(0, 6)}…{d.address.slice(-4)}
                      </Txt>
                    </View>
                  </Pressable>
                  {p && (
                    <View style={{ alignItems: 'center' }}>
                      <Stepper value={p.weight} min={1} max={9} onChange={(w) => setPicks((ps) => ps.map((x) => (x.address === d.address ? { ...x, weight: w } : x)))} />
                      <Txt v="small">peso</Txt>
                    </View>
                  )}
                </View>
              </Card>
            );
          })}
          {picks
            .filter((p) => !candidates.some((c) => c.address === p.address))
            .map((p) => (
              <Card key={p.address} style={{ paddingVertical: 10, borderColor: C.green + '66' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
                  <Pressable onPress={() => setPicks((ps) => ps.filter((x) => x.address !== p.address))}>
                    <Feather name="check-square" size={22} color={C.green} />
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Txt v="body">{p.label}</Txt>
                    <Txt v="small">Otro teléfono · {p.address.slice(0, 6)}…{p.address.slice(-4)}</Txt>
                  </View>
                  <Stepper value={p.weight} min={1} max={9} onChange={(w) => setPicks((ps) => ps.map((x) => (x.address === p.address ? { ...x, weight: w } : x)))} />
                </View>
              </Card>
            ))}

          <Card>
            <Txt v="h3">Firmante en otro teléfono</Txt>
            <Txt v="small" style={{ marginBottom: SP.md }}>
              Pega la dirección del dispositivo que firmará desde otro teléfono con Quorum.
            </Txt>
            <Field label="Nombre" value={extName} onChangeText={setExtName} placeholder="Tangem de María" />
            <Field
              label="Dirección"
              value={extAddr}
              onChangeText={setExtAddr}
              placeholder="r…"
              right={
                <>
                  <Pressable style={{ padding: 6 }} onPress={() => scanner.open((a: string) => setExtAddr(a))}>
                    <Feather name="maximize" size={18} color={C.green} />
                  </Pressable>
                  {scanner.modal}
                </>
              }
            />
            <Button
              title="Agregar firmante"
              kind="secondary"
              disabled={!isValidClassicAddress(extAddr.trim()) || extAddr.trim() === vault.address || picks.some((p) => p.address === extAddr.trim())}
              onPress={() => {
                const label = extName.trim() || 'Firmante externo';
                setPicks((ps) => [...ps, { address: extAddr.trim(), label, weight: 1, external: true }]);
                if (!app.contacts.some((c) => c.address === extAddr.trim())) {
                  app.saveContact({ id: newId(), label, address: extAddr.trim() });
                }
                setExtAddr('');
                setExtName('');
              }}
            />
          </Card>

          <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Txt v="h3">Quórum</Txt>
              <Txt v="small">Peso necesario para mover fondos (total {total})</Txt>
            </View>
            <Stepper value={quorum} min={1} max={Math.max(1, total)} onChange={setQuorum} />
          </Card>

          {picks.length > 0 && need < 2 && <Notice>Con esta configuración un solo dispositivo basta para mover todo.</Notice>}
          {picks.length > 0 && tol < 1 && Number.isFinite(need) && <Notice>Si pierdes un dispositivo quedarás bloqueado. Agrega un firmante de respaldo.</Notice>}

          <Button
            title={editing ? 'Revisar cambios' : 'Continuar'}
            busy={checking}
            disabled={picks.length < 1 || !Number.isFinite(need) || !st?.exists}
            onPress={async () => {
              if (editing) return goReview();
              if (await checkSigners()) setStep('protect');
            }}
          />
        </>
      )}

      {step === 'protect' && (
        <>
          <Txt v="h1">Protección extra</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.xl }}>
            {created
              ? 'Opcional. Cada opción es una transacción más, firmada con tus números secretos junto con la multifirma.'
              : t('Opcional. Cada opción es una transacción que firmará {d}.', { d: masterDevice?.label ?? t('el dispositivo creador') })}
          </Txt>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
              <View style={{ flex: 1 }}>
                <Txt v="h3">Bloquear entradas no deseadas</Txt>
                <Txt v="small">Nadie podrá abrirle líneas de confianza, cheques, ofertas de NFT ni canales de pago. Solo recibe pagos.</Txt>
              </View>
              <Switch value={harden} onValueChange={setHarden} trackColor={{ true: C.greenDeep, false: C.line }} thumbColor={C.text} />
            </View>
          </Card>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.md }}>
              <View style={{ flex: 1 }}>
                <Txt v="h3">Firmas en paralelo</Txt>
                <Txt v="small">Reserva 5 tickets para tener varias operaciones pendientes a la vez sin que se anulen entre sí. Cada ticket reserva 0,2 XRP.</Txt>
              </View>
              <Switch value={tickets} onValueChange={setTickets} trackColor={{ true: C.greenDeep, false: C.line }} thumbColor={C.text} />
            </View>
          </Card>
          <Button title="Revisar" busy={checking} onPress={goReview} />
        </>
      )}

      {step === 'run' && vault && (
        <>
          <Txt v="h1">{allDone ? 'Bóveda configurada' : 'Revisa y firma'}</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.xl }}>
            {how === 'secret'
              ? t('Escribirás tus números secretos una vez y Quorum firmará {n} transacción(es) seguidas.', { n: plan.length })
              : how === 'master'
                ? t('{d} firmará {n} transacción(es), una por una. Ten el dispositivo a mano.', { d: masterDevice?.label ?? '', n: plan.length })
                : 'La bóveda ya usa multifirma: se creará una operación para que tus firmantes la aprueben.'}
          </Txt>
          <Card>
            {plan.map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                <Feather
                  name={p.state === 'ok' ? 'check-circle' : p.state === 'run' ? 'loader' : p.state === 'err' ? 'x-circle' : 'circle'}
                  size={20}
                  color={p.state === 'ok' ? C.green : p.state === 'err' ? C.bad : p.state === 'run' ? C.warn : C.faint}
                />
                <Txt v="body" style={{ flex: 1 }}>
                  {p.label}
                </Txt>
              </View>
            ))}
          </Card>
          <Card>
            <Txt v="label" style={{ marginBottom: 4 }}>
              Firmantes
            </Txt>
            {picks.map((p) => (
              <View key={p.address} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
                <Txt v="body">{p.label}</Txt>
                <Badge text={t('peso {n}', { n: p.weight })} color={C.dim} />
              </View>
            ))}
            <Txt v="small" style={{ marginTop: 6 }}>
              {t('Quórum {q} · se necesitan {a} de {b}', { q: quorum, a: need, b: picks.length })}
            </Txt>
          </Card>

          {allDone && created ? (
            <>
              <Notice kind="info">
                Faltan dos pasos: probar una operación con multifirma y desactivar la master key con tus números secretos. Hasta entonces la bóveda queda en preparación.
              </Notice>
              <Button title="Siguiente: probar la multifirma" onPress={() => nav.replace('finishVault', { id: vault.id })} />
            </>
          ) : allDone ? (
            <>
              <Notice kind="info">
                Siguiente paso: prueba un envío pequeño firmando con distintos pares de dispositivos. Cuando todo funcione, desactiva la master key desde Seguridad.
              </Notice>
              <Button title="Ir a la bóveda" onPress={() => nav.replace('account', { id: vault.id })} />
            </>
          ) : (
            <Button title={useMaster ? 'Firmar y aplicar' : 'Crear operación'} icon="edit-3" busy={running} onPress={run} />
          )}
          {!running && !allDone && <Button title="Volver" kind="ghost" onPress={() => setStep(editing ? 'signers' : 'protect')} />}
        </>
      )}

      {vault && (
        <SecretEntrySheet
          visible={askSecret}
          address={vault.address}
          title="Escribe tus números secretos"
          text="Los que anotaste al crear la bóveda. Quorum firma con ellos la configuración y los borra al terminar; no se guardan en el teléfono."
          confirm="Firmar y aplicar"
          onCancel={() => setAskSecret(false)}
          onSubmit={(rows) => {
            setAskSecret(false);
            runPlan(rows);
          }}
        />
      )}
    </Screen>
  );
}
