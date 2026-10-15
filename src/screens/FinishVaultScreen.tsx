/**
 * Termina una bóveda creada en Quorum: probar una operación con multifirma y desactivar la
 * master key con los números secretos. Hasta entonces la bóveda está "en preparación".
 */
import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Alert } from 'react-native';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { Button, Card, Notice, Screen, Txt, success, warnBuzz } from '../ui/components';
import { C, SP } from '../ui/theme';
import { buildDisableMaster } from '../core/tx';
import { fetchReserves, hasMultisigTx } from '../core/network';
import { Reserves, setupBalanceLimitXrp, setupMinimumXrp } from '../core/seedVault';
import { SecretEntrySheet } from '../ui/secret';
import { Step } from './UnvaultScreen';

/** Nota de la operación de prueba (también sirve para reconocerla). */
export const MULTISIG_TEST_NOTE = 'Prueba de multifirma (sin efecto)';

export default function FinishVaultScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id);
  const st = a ? app.stateOf(a) : undefined;
  const [busy, setBusy] = useState(false);
  const [ask, setAsk] = useState(false);
  const [reserves, setReserves] = useState<Reserves | null>(null);

  // La prueba con multifirma puede haberse enviado desde otro teléfono: el ledger es la fuente.
  const [ledgerTested, setLedgerTested] = useState(false);
  useEffect(() => {
    if (!a) return;
    hasMultisigTx(a.network, a.address)
      .then(setLedgerTested)
      .catch(() => {});
  }, [id, app.proposals.length, st?.sequence, st?.tickets.length]);

  useEffect(() => {
    if (!a) return;
    app.refreshAccount(a);
    fetchReserves(a.network)
      .then(setReserves)
      .catch(() => {});
  }, [id]);

  if (!a) {
    return (
      <Screen title="Terminar bóveda" onBack={nav.pop}>
        <Txt v="body">Esta cuenta ya no existe.</Txt>
      </Screen>
    );
  }

  const list = st?.signerList;
  const mine = app.proposals.filter((p) => p.account === a.address && p.network === a.network);
  const tested = ledgerTested || mine.some((p) => p.mode === 'multi' && p.status === 'submitted');
  const pendingTest = mine.find((p) => p.mode === 'multi' && p.note === MULTISIG_TEST_NOTE && (p.status === 'collecting' || p.status === 'ready'));
  const masterOff = !!st?.masterDisabled;
  const r = reserves ?? { base: 1, inc: 0.2 };
  const minXrp = setupMinimumXrp(r, st?.tickets.length ? 5 : 0);
  const overLimit = !!st?.exists && !masterOff && Number(st.balanceXrp) > setupBalanceLimitXrp(r, 5);

  const createTest = async () => {
    setBusy(true);
    try {
      // AccountSet sin cambios: no modifica nada, solo demuestra que el quórum puede firmar.
      const p = await app.createProposal(a, { TransactionType: 'AccountSet', Account: a.address }, { mode: 'multi', note: MULTISIG_TEST_NOTE });
      nav.push('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo crear', e, nav);
    } finally {
      setBusy(false);
    }
  };

  const disable = () => {
    if (!tested) return;
    const go = () =>
      Alert.alert(
        'Desactivar master key',
        'Desde ese momento, solo el quórum podrá mover fondos. Quorum no ofrece volver a cuenta normal en esta bóveda.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', style: 'destructive', onPress: () => setAsk(true) },
        ],
      );
    if (overLimit) {
      return Alert.alert(
        'Tiene más de lo necesario',
        t('Esta bóveda tiene {b} XRP y aún no está protegida. Lo recomendado eran unos {m} XRP hasta este paso.', { b: st!.balanceXrp, m: minXrp }),
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Entiendo el riesgo, continuar', style: 'destructive', onPress: go },
        ],
      );
    }
    go();
  };

  const runDisable = async (rows: string[]) => {
    setBusy(true);
    try {
      // El XRP Ledger exige que desactivar la master key lo firme la propia master key.
      const p = await app.createProposal(a, buildDisableMaster(a.address), { mode: 'single' });
      await app.signProposalWithSecret(p.id, rows);
      const res = await app.submitProposal(p.id);
      if (res.status !== 'submitted') throw new Error(t('La red no la aceptó ({x}).', { x: res.result ?? '?' }));
      const st2 = await app.refreshAccount(a);
      if (!st2?.masterDisabled) throw new Error('La red todavía no muestra la master key desactivada. Actualiza en unos segundos.');
      success();
    } catch (e: any) {
      warnBuzz();
      proposalFailed('No se pudo desactivar', e, nav);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="Terminar bóveda"
      onBack={nav.pop}
      refreshing={busy}
      onRefresh={() => {
        app.refreshAccount(a);
      }}
    >
      {masterOff ? (
        <>
          <Txt v="h1">Bóveda lista</Txt>
          <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.lg }}>
            La master key está desactivada: solo el quórum mueve los fondos. Ya puedes usar la bóveda normalmente.
          </Txt>
          <Notice kind="info">
            Guarda tus números secretos en un lugar seguro. No sirven para mover fondos mientras la master key siga desactivada. Quorum no ofrece volver a cuenta normal en esta bóveda: para salir, mueve los fondos con multifirma a otra cuenta.
          </Notice>
          <Button title="Ir a la bóveda" onPress={() => nav.replace('account', { id: a.id })} />
        </>
      ) : (
        <>
          <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
            La bóveda está en preparación: mientras la master key esté activa, quien tenga los números secretos controla la cuenta. Mantén solo lo mínimo hasta terminar.
          </Txt>
          {overLimit && (
            <Notice kind="bad">
              {t('Esta bóveda tiene {b} XRP y todavía no está protegida. Lo recomendado son unos {m} XRP hasta terminar.', { b: st!.balanceXrp, m: minXrp })}
            </Notice>
          )}
          {st && !st.exists && (
            <Card>
              <Txt v="small">{t('La cuenta aún no existe en la red. Envíale solo unos {m} XRP para activarla.', { m: minXrp })}</Txt>
              <Button title="Ver dirección para recibir" kind="secondary" icon="arrow-down-left" onPress={() => nav.push('receive', { id: a.id })} />
            </Card>
          )}

          <Step
            n={1}
            title="Firmantes y quórum"
            text={list ? t('Configurados: {n} firmantes, quórum {q}.', { n: list.entries.length, q: list.quorum }) : 'Elige los firmantes y el quórum.'}
            state={list ? 'done' : 'next'}
            action={<Button title="Configurar firmantes" icon="users" onPress={() => nav.push('vaultWizard', { id: a.id })} />}
          />

          <Step
            n={2}
            title="Probar la multifirma"
            text={
              tested
                ? 'Una operación con multifirma ya se validó en la red.'
                : 'Se crea una operación sin efecto que tus firmantes deben aprobar hasta alcanzar el quórum. Solo cuesta la comisión de la red.'
            }
            state={tested ? 'done' : list ? 'next' : 'locked'}
            action={
              list ? (
                pendingTest ? (
                  <Button title="Ver operación de prueba" icon="arrow-right" onPress={() => nav.push('proposal', { id: pendingTest.id })} />
                ) : (
                  <Button title="Crear operación de prueba" icon="users" busy={busy} onPress={createTest} />
                )
              ) : undefined
            }
          />

          <Step
            n={3}
            title="Desactivar la master key"
            text="Se firma con tus números secretos: el XRP Ledger exige la propia master key para este paso. Desde ahí, solo el quórum mueve fondos."
            state={tested ? 'next' : 'locked'}
            action={tested ? <Button title="Escribir números y desactivar" icon="lock" kind="danger" busy={busy} onPress={disable} /> : undefined}
          />
        </>
      )}

      <SecretEntrySheet
        visible={ask}
        testnet={a.network === 'testnet'}
        address={a.address}
        title="Escribe tus números secretos"
        text="Los que anotaste al crear la bóveda. Se usan solo para firmar la desactivación de la master key y no se guardan."
        confirm="Desactivar master key"
        onCancel={() => setAsk(false)}
        onSubmit={(rows) => {
          setAsk(false);
          runDisable(rows);
        }}
      />
    </Screen>
  );
}
