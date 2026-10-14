import React, { useEffect, useMemo, useState } from 'react';
import { t } from '../i18n';
import { Alert, Linking, View } from 'react-native';
import { useApp, signedWeight } from '../state';
import { useNav } from '../nav';
import { useMoney } from '../ui/money';
import { Badge, BusySheet, Button, Card, Check, ListItem, Notice, QuorumRing, Row, Screen, Txt, success, warnBuzz } from '../ui/components';
import { C, SP } from '../ui/theme';
import { describeTx } from '../core/tx';
import { NETWORKS, currentLedger } from '../core/network';
import { KIND_LABEL, SignerDevice } from '../signers/types';
import { Proposal } from '../store';

export const STATUS: Record<Proposal['status'], { text: string; color: string }> = {
  // getters: el color se lee al dibujar (cambia con el tema)
  get collecting() {
    return { text: 'Juntando firmas', color: C.warn };
  },
  get ready() {
    return { text: 'Lista para enviar', color: C.green };
  },
  get submitted() {
    return { text: 'Enviada', color: C.dim };
  },
  get failed() {
    return { text: 'Falló', color: C.bad };
  },
  get expired() {
    return { text: 'Vencida', color: C.faint };
  },
};

const RESULT_TEXT: Record<string, string> = {
  tesSUCCESS: 'Confirmada en el ledger',
  tecUNFUNDED_PAYMENT: 'Saldo insuficiente',
  tecNO_DST_INSUF_XRP: 'El destino no existe y el monto no alcanza para activarlo',
  tecDST_TAG_NEEDED: 'El destino exige destination tag',
  tefBAD_QUORUM: 'Firmas insuficientes para el quórum',
  tefBAD_SIGNATURE: 'Una firma no es válida',
  tefPAST_SEQ: 'La secuencia ya fue usada',
  tefMAX_LEDGER: 'La propuesta venció antes de enviarse',
  tefMASTER_DISABLED: 'La master key ya está desactivada',
  tefNOT_MULTI_SIGNING: 'La cuenta no tiene lista de firmantes',
  tecNO_ALTERNATIVE_KEY: 'No se puede desactivar la master key sin otra forma de firmar (lista de firmantes o regular key)',
  tecNO_PERMISSION: 'La cuenta no tiene permiso para esta operación',
  tecNEED_MASTER_KEY: 'Esta operación debe firmarla la master key de la cuenta (no la multifirma)',
  tecINSUFFICIENT_RESERVE: 'La cuenta no tiene reserva suficiente',
  telINSUF_FEE_P: 'La comisión es muy baja para la carga actual de la red; vuelve a intentar',
  terPRE_SEQ: 'Hay una operación anterior de esta cuenta que aún no se envía',
  terQUEUED: 'Quedó en cola en la red',
  tecUNFUNDED_OFFER: 'Saldo insuficiente para la orden',
  tecKILLED: 'No había liquidez suficiente al precio pedido',
};

export default function ProposalScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const p = app.proposals.find((x) => x.id === id);
  const [err, setErr] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null); // minutos aprox. antes de vencer

  useEffect(() => {
    if (!p?.tx.LastLedgerSequence || !(p.status === 'collecting' || p.status === 'ready')) return;
    let alive = true;
    const tick = async () => {
      try {
        const l = await currentLedger(p.network);
        if (alive) setLeft(Math.floor(((p.tx.LastLedgerSequence - l) * 3.5) / 60));
      } catch {}
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [p?.id, p?.status]);

  const acc = p ? app.accountFor(p.network, p.account) : undefined;
  const st = acc ? app.stateOf(acc) : undefined;
  const list = st?.signerList;

  const rows = useMemo(() => {
    if (!p) return [];
    if (p.mode === 'single') return [{ account: p.account, weight: 1, device: app.deviceFor(p.account), signed: !!p.tx.TxnSignature }];
    const entries = list?.entries ?? p.signatures.map((s) => ({ account: s.Account, weight: 1 }));
    return entries.map((e) => ({
      account: e.account,
      weight: e.weight,
      device: app.deviceFor(e.account),
      signed: p.signatures.some((s) => s.Account === e.account),
    }));
  }, [p, list, app.devices]);

  if (!p) {
    return (
      <Screen title="Operación" onBack={nav.pop}>
        <Txt v="body">Esta operación ya no existe.</Txt>
      </Screen>
    );
  }

  const d = describeTx(p.tx, p.network);
  const s = STATUS[p.status];
  const net = NETWORKS[p.network];
  const active = p.status === 'collecting' || p.status === 'ready';
  const weight = p.mode === 'multi' ? signedWeight(p.signatures, list) : p.tx.TxnSignature ? 1 : 0;
  const quorum = p.mode === 'multi' ? list?.quorum ?? 0 : 1;
  const nameOf = (addr: string) =>
    app.accounts.find((x) => x.address === addr)?.label ?? app.contacts.find((c) => c.address === addr)?.label ?? app.deviceFor(addr)?.label;

  const sign = async (dev: SignerDevice) => {
    setErr(null);
    try {
      await app.signProposal(p.id, dev);
      success();
    } catch (e: any) {
      warnBuzz();
      setErr(e?.message ?? String(e));
    }
  };

  const submit = () =>
    Alert.alert('Enviar a la red', `${t(d.title)}\n${net.label}\n\n${t('Una vez enviada no se puede deshacer.')}`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Enviar',
        onPress: async () => {
          setErr(null);
          try {
            const r = await app.submitProposal(p.id);
            if (r.status === 'submitted') {
              success();
              return;
            }
            warnBuzz();
            const code = r.result ?? 'desconocido';
            const msg =
              r.status === 'failed'
                ? t('La red la procesó pero no se aplicó: {x}.', { x: t(RESULT_TEXT[code] ?? code) })
                : t('La red no la aceptó: {x} ({c}).', { x: t(RESULT_TEXT[code] ?? r.resultMessage ?? code), c: code });
            setErr(msg);
            Alert.alert('No se envió', msg);
          } catch (e: any) {
            warnBuzz();
            setErr(e?.message ?? String(e));
            Alert.alert('No se envió', e?.message ?? String(e));
          }
        },
      },
    ]);

  return (
    <Screen title="Operación" onBack={nav.pop}>
      <BusySheet visible={!!app.busy} text={app.busy ?? ''} />

      <View style={{ alignItems: 'center', paddingVertical: SP.md }}>
        <QuorumRing
          size={150}
          segments={rows.map((r) => ({ weight: r.weight, on: r.signed }))}
          center={`${weight}/${quorum}`}
          sub={p.mode === 'multi' ? 'peso firmado' : 'firma'}
        />
        <Txt v="h2" style={{ marginTop: SP.lg, textAlign: 'center' }}>
          {d.title}
        </Txt>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Badge text={s.text} color={s.color} />
          {p.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
        </View>
      </View>

      {p.tx.TransactionType === 'Payment' && typeof p.tx.Amount === 'string' && (
        <Card style={{ alignItems: 'center' }}>
          <Txt v="hero">{m.xrp(Number(p.tx.Amount) / 1e6)} XRP</Txt>
          <Txt v="body" color={C.dim}>
            {m.fiatOf(Number(p.tx.Amount) / 1e6, p.network)}
          </Txt>
        </Card>
      )}

      <Card>
        <Row k="Desde" v={acc?.label ?? `${p.account.slice(0, 8)}…`} />
        {d.lines
          .filter(([k]) => k !== 'Cuenta' && !(k === 'Monto' && typeof p.tx.Amount === 'string'))
          .map(([k, v]) => {
            const label = /^r[1-9A-HJ-NP-Za-km-z]{24,34}/.test(v) ? nameOf(v.split(' ')[0]) : undefined;
            return <Row key={k} k={k} v={label ? `${label} · ${v.slice(0, 6)}…${v.split(' ')[0].slice(-4)}${v.includes('(') ? ' ' + v.slice(v.indexOf('(')) : ''}` : v} mono={!label && /^r[1-9A-HJ-NP-Za-km-z]{24,34}/.test(v)} />;
          })}
        {p.hash && <Row k="Hash" v={`${p.hash.slice(0, 10)}…`} mono />}
        {p.result && <Row k="Resultado" v={RESULT_TEXT[p.result] ?? p.result} />}
      </Card>

      <Card>
        <Txt v="h3" style={{ marginBottom: SP.sm }}>
          {p.mode === 'multi' ? t('Firmas · se necesita peso {n}', { n: quorum }) : 'Firma de la clave maestra'}
        </Txt>
        {rows.map((r) => (
          <View key={r.account} style={{ borderTopWidth: 1, borderColor: C.line, paddingVertical: 4 }}>
            <ListItem
              icon={r.signed ? 'check' : r.device ? (r.device.kind === 'ledger' ? 'cpu' : r.device.kind === 'tangem' ? 'credit-card' : 'smartphone') : 'smartphone'}
              iconColor={r.signed ? C.green : r.device ? C.dim : C.faint}
              title={r.device ? r.device.label : 'En otro teléfono'}
              subtitle={`${r.device ? KIND_LABEL[r.device.kind] + ' · ' : ''}${r.account.slice(0, 6)}…${r.account.slice(-4)}${p.mode === 'multi' ? ' · ' + t('peso {n}', { n: r.weight }) : ''}`}
              right={r.signed ? <Badge text="Firmó" /> : undefined}
            />
            {!r.signed && active && r.device && <Button title={t('Firmar con {x}', { x: r.device.label })} kind="secondary" icon="edit-3" onPress={() => sign(r.device!)} />}
          </View>
        ))}
        {p.network === 'testnet' && active && rows.some((r) => !r.signed && r.device?.kind === 'xaman') && (
          <Notice kind="info">
            Esta operación es de testnet: antes de firmar, Xaman debe estar en “XRPL Testnet” (Configuración → Avanzado → Modo desarrollador, y luego el botón de red en Inicio).
          </Notice>
        )}
        {err && <Notice kind="bad">{err}</Notice>}
        {(p.network === 'testnet' || /red|network|disponible/i.test(err ?? '')) && rows.some((r) => r.device?.kind === 'xaman') && (
          <Button title="Cómo cambiar Xaman a testnet" kind="ghost" icon="help-circle" onPress={() => nav.push('guide', {})} />
        )}
      </Card>

      {active && left !== null && (
        <Notice kind={left < 10 ? 'warn' : 'info'}>
          {left <= 0
            ? 'Esta operación está por vencer o ya venció. Si no alcanzas a enviarla, crea una nueva.'
            : t('Vence en ~{x}. Hay que juntar las firmas y enviarla antes de eso.', { x: left >= 120 ? `${Math.round(left / 60)} h` : `${left} min` })}
        </Notice>
      )}
      {p.status === 'ready' && <Button title="Enviar a la red" icon="send" onPress={submit} />}

      {active && p.mode === 'multi' && (
        <Card style={{ marginTop: SP.md }}>
          <Txt v="h3">¿Un firmante está en otro teléfono?</Txt>
          <Txt v="small" style={{ marginTop: 4 }}>
            Muéstrale este QR. Quorum en ese teléfono lo escanea, firma con su dispositivo y te muestra otro QR con su firma: escanéalo aquí. Sin internet y sin servidores.
          </Txt>
          <View style={{ flexDirection: 'row', gap: SP.md }}>
            <Button title="Mostrar QR" icon="grid" kind="secondary" style={{ flex: 1 }} onPress={() => nav.push('showQr', { id: p.id })} />
            <Button title="Escanear firma" icon="maximize" kind="secondary" style={{ flex: 1 }} onPress={() => nav.push('scan', { purpose: 'any' })} />
          </View>
        </Card>
      )}

      {p.status === 'expired' && <Notice>Esta operación venció o su secuencia ya se usó. Crea una nueva.</Notice>}

      {p.hash && (p.status === 'submitted' || p.status === 'failed') && (
        <Button title="Ver en el explorador" kind="ghost" icon="external-link" onPress={() => Linking.openURL(`${net.explorer}/transactions/${p.hash}`)} />
      )}
      <Button
        title={active ? 'Descartar operación' : 'Quitar del historial'}
        kind="danger"
        onPress={() =>
          Alert.alert('Descartar', 'Se elimina de este teléfono. Si ya se envió, no afecta a la red.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Descartar',
              style: 'destructive',
              onPress: async () => {
                await app.deleteProposal(p.id);
                nav.pop();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
