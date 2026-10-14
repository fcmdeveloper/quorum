import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Alert, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { Button, Card, Notice, Screen, Txt, success, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { TxJson, buildClearFlag, buildEnableMaster, buildRemoveSignerList } from '../core/tx';

type StepState = 'done' | 'next' | 'locked' | 'optional';

export function Step({
  n,
  title,
  text,
  state,
  action,
}: {
  n: number;
  title: string;
  text: string;
  state: StepState;
  action?: React.ReactNode;
}) {
  const done = state === 'done';
  return (
    <Card style={{ opacity: state === 'locked' ? 0.5 : 1, borderColor: state === 'next' ? C.green : C.line }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: done ? C.green : C.greenGlow,
          }}
        >
          {done ? <Feather name="check" size={16} color={C.greenInk} /> : <Txt v="small" color={C.green}>{n}</Txt>}
        </View>
        <View style={{ flex: 1 }}>
          <Txt v="h3">{title}</Txt>
          <Txt v="small" style={{ marginTop: 2 }}>
            {text}
          </Txt>
        </View>
      </View>
      {!done && action}
    </Card>
  );
}

/**
 * Revierte una bóveda a cuenta normal, en el orden que exige el XRP Ledger:
 * 1) reactivar la master key (con multifirma), 2) borrar la lista de firmantes,
 * 3) opcional: quitar los bloqueos de entrada, 4) marcarla como cuenta normal en Quorum.
 */
export default function UnvaultScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id)!;
  const st = app.stateOf(a);
  const master = app.deviceFor(a.address);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    app.refreshAccount(a);
  }, [id]);

  const pending = app.proposals.find((p) => p.account === a.address && p.network === a.network && (p.status === 'collecting' || p.status === 'ready'));
  const masterOn = !!st && !st.masterDisabled;
  const listGone = !!st && !st.signerList;
  const flagsOn = st?.hardening.filter((h) => h.on) ?? [];

  const create = async (tx: TxJson, mode: 'single' | 'multi') => {
    setBusy(true);
    try {
      const p = await app.createProposal(a, tx, { mode });
      nav.push('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo crear', e, nav);
    } finally {
      setBusy(false);
    }
  };

  // Con la master key activa y registrada, lo más simple es firmar con ella; si no, multifirma.
  const modeAfterMaster = (): 'single' | 'multi' => (master && masterOn ? 'single' : 'multi');

  const finish = () =>
    Alert.alert(
      'Volver a cuenta normal',
      master
        ? t('“{a}” quedará como cuenta normal, firmada solo por {d}.', { a: a.label, d: master.label })
        : t('“{a}” quedará como cuenta normal. Ojo: no tienes registrado en Quorum el dispositivo de su llave, así que no podrás firmar con ella desde aquí hasta agregarlo.', { a: a.label }),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            await app.updateAccount(a.id, { kind: 'wallet' });
            success();
            toast(t('{x} ya es una cuenta normal', { x: a.label }));
            nav.pop();
            nav.pop();
          },
        },
      ],
    );

  if (a.origin === 'quorum') {
    return (
      <Screen title="Volver a cuenta normal" onBack={nav.pop}>
        <Notice kind="info">
          Esta bóveda se creó en Quorum y, por regla de Quorum, no puede volver a cuenta normal: reactivar su master key haría valer de nuevo sus números secretos. Para salir, mueve los fondos con multifirma a otra cuenta.
        </Notice>
        <Button title="Enviar fondos" icon="arrow-up-right" onPress={() => nav.replace('send', { id: a.id })} />
      </Screen>
    );
  }

  if (!st) {
    return (
      <Screen title="Volver a cuenta normal" onBack={nav.pop}>
        <Txt v="small">Leyendo la cuenta en la red…</Txt>
      </Screen>
    );
  }

  return (
    <Screen
      title="Volver a cuenta normal"
      onBack={nav.pop}
      refreshing={busy}
      onRefresh={() => {
        app.refreshAccount(a);
      }}
    >
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
        La dirección y los fondos no cambian. Se deshace la protección en el orden que exige el XRP Ledger: no se puede borrar la multifirma mientras sea la única forma de firmar.
      </Txt>

      {pending && (
        <Notice kind="info">
          Hay una operación pendiente de esta cuenta. Fírmala y envíala (o elimínala) antes del siguiente paso.
        </Notice>
      )}
      {pending && <Button title="Ver operación pendiente" icon="arrow-right" onPress={() => nav.push('proposal', { id: pending.id })} />}

      <Step
        n={1}
        title="Reactivar la master key"
        text={
          masterOn
            ? 'La master key está activa.'
            : 'Se firma con la multifirma (el quórum de la bóveda), porque la master key está apagada.'
        }
        state={masterOn ? 'done' : 'next'}
        action={<Button title="Crear operación" icon="unlock" disabled={!!pending || busy} onPress={() => create(buildEnableMaster(a.address), 'multi')} />}
      />

      <Step
        n={2}
        title="Borrar la lista de firmantes"
        text={
          listGone
            ? 'La cuenta ya no tiene firmantes.'
            : `${t('Libera 0,2 XRP de reserva.')} ${
                master && masterOn
                  ? t('Lo firma {x} (master key).', { x: master.label })
                  : master
                    ? t('Lo firmará {x} cuando la master key esté activa (o el quórum).', { x: master.label })
                    : t('Lo firma el quórum.')
              }`
        }
        state={listGone ? 'done' : masterOn ? 'next' : 'locked'}
        action={
          masterOn ? (
            <Button
              title="Crear operación"
              icon="users"
              kind="secondary"
              disabled={!!pending || busy}
              onPress={() =>
                Alert.alert('Borrar la multifirma', 'Desde ese momento, la cuenta se moverá solo con su master key.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Continuar', style: 'destructive', onPress: () => create(buildRemoveSignerList(a.address), modeAfterMaster()) },
                ])
              }
            />
          ) : undefined
        }
      />

      <Step
        n={3}
        title="Quitar bloqueos de entrada (opcional)"
        text={
          flagsOn.length
            ? t('Activos: {x}. Puedes dejarlos: no molestan en una cuenta normal. Se quitan de a uno.', { x: flagsOn.map((f) => t(f.label)).join(', ') })
            : 'No hay bloqueos activos.'
        }
        state={flagsOn.length ? 'optional' : 'done'}
        action={
          flagsOn.length ? (
            <Button
              title={t('Quitar: {x}', { x: t(flagsOn[0].label) })}
              kind="ghost"
              icon="x-circle"
              disabled={!!pending || busy}
              onPress={() => create(buildClearFlag(a.address, flagsOn[0].asf), listGone ? modeAfterMaster() : 'multi')}
            />
          ) : undefined
        }
      />

      {st.tickets.length > 0 && (
        <Txt v="small" style={{ marginBottom: SP.md }}>
          {st.tickets.length === 1
            ? t('Queda 1 ticket sin usar (0,2 XRP de reserva). No se puede cancelar directamente; se libera al usarlo.')
            : t('Quedan {n} tickets sin usar (0,2 XRP de reserva cada uno). No se pueden cancelar directamente; se liberan al usarlos.', { n: st.tickets.length })}
        </Txt>
      )}

      <Step
        n={4}
        title="Marcar como cuenta normal en Quorum"
        text="Cuando la master key esté activa y no quede lista de firmantes."
        state={masterOn && listGone ? 'next' : 'locked'}
        action={<Button title="Terminar" icon="check" disabled={!(masterOn && listGone)} onPress={finish} />}
      />
    </Screen>
  );
}
