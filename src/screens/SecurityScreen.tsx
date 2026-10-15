import React, { useState } from 'react';
import { t } from '../i18n';
import { Alert, Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useAddressScanner } from '../ui/ScanView';
import { proposalFailed } from '../ui/proposalError';
import { Badge, Button, Card, ListItem, Notice, QuorumRing, Screen, Section, Txt, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { HealthCheck, lossTolerance, minSigners, vaultHealth } from '../core/health';
import { HARDENING, buildDisableMaster, buildHardening, buildRemoveRegularKey, buildSetFlag, buildTicketCreate } from '../core/tx';

export default function SecurityScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const scanner = useAddressScanner();
  const a = app.accounts.find((x) => x.id === id)!;
  const st = app.stateOf(a);
  const h = vaultHealth(st);
  const list = st?.signerList;
  const [busy, setBusy] = useState<string | null>(null);

  const propose = async (key: string, txs: any[], mode?: 'single' | 'multi') => {
    setBusy(key);
    let first: string | null = null;
    let created = 0;
    try {
      for (const tx of txs) {
        const p = await app.createProposal(a, tx, mode ? { mode } : {});
        first = first ?? p.id;
        created++;
      }
    } catch (e: any) {
      // si ya se creó alguna, igual la abrimos; el resto se crea después
      if (!first) {
        proposalFailed('No se pudo crear', e, nav);
        return;
      }
    } finally {
      setBusy(null);
    }
    if (created > 1) toast(t('{n} operaciones creadas', { n: created }));
    if (created < txs.length) toast(t('Faltan {n}: vuelve a Resolver después de enviar esta', { n: txs.length - created }), 'warn');
    if (first) nav.push('proposal', { id: first });
  };

  // operación pendiente que cambia esta protección (para no crear otra encima)
  const pendingFlag = (asf: number) =>
    app.proposals.find(
      (p) =>
        p.account === a.address &&
        p.network === a.network &&
        (p.status === 'collecting' || p.status === 'ready') &&
        p.tx.TransactionType === 'AccountSet' &&
        (p.tx.SetFlag === asf || p.tx.ClearFlag === asf),
    );

  const toggleFlag = (asf: number, on: boolean) => {
    const h = HARDENING.find((x) => x.asf === asf)!;
    const pend = pendingFlag(asf);
    if (pend) return nav.push('proposal', { id: pend.id });
    if (!list) return Alert.alert('Primero la multifirma', 'Configura la lista de firmantes antes de cambiar las protecciones.');
    if (on) return propose(`flag${asf}`, [buildHardening(a.address, asf, true)]);
    Alert.alert(t(h.allow), `${t(h.what)}\n\n${t('Se crea una operación que firma el quórum. Puedes volver a bloquearlo cuando quieras.')}`, [
      { text: t('Cancelar'), style: 'cancel' },
      { text: t('Crear operación'), onPress: () => propose(`flag${asf}`, [buildHardening(a.address, asf, false)]) },
    ]);
  };

  const fix = (c: HealthCheck) => {
    if (!st) return;
    switch (c.fix) {
      case 'signers':
        return nav.push('vaultWizard', { id: a.id });
      case 'disableMaster':
        // Bóveda creada en Quorum: se termina con sus números secretos, después de probar la multifirma.
        if (a.origin === 'quorum') return nav.push('finishVault', { id: a.id });
        if (!list) return Alert.alert('Primero la multifirma', 'Configura la lista de firmantes antes de desactivar la master key.');
        // El XRP Ledger exige que desactivar la master key lo firme la propia master key
        // (con multifirma da tecNEED_MASTER_KEY).
        if (!app.deviceFor(a.address)) {
          return Alert.alert(
            'Falta la llave original',
            'Para desactivar la master key, el XRP Ledger exige firmar con esa misma llave (el dispositivo que creó la bóveda). Agrega ese dispositivo en Quorum y vuelve a intentar.',
          );
        }
        return Alert.alert(
          'Desactivar master key',
          'Hazlo solo después de probar un envío con cada par de firmantes. Desde ese momento, únicamente el quórum podrá mover fondos.',
          [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Ya probé, continuar', style: 'destructive', onPress: () => propose('master', [buildDisableMaster(a.address)], 'single') },
          ],
        );
      case 'removeRegular':
        return propose('regular', [buildRemoveRegularKey(a.address)]);
      case 'harden': {
        const missing = st.hardening.filter((x) => !x.on);
        // Sin tickets, cada operación usa la secuencia de la cuenta: solo cabe una pendiente a la vez.
        const free = st.signerList ? st.tickets.length : 0;
        const n = Math.max(1, Math.min(missing.length, free));
        if (n < missing.length) toast(t('Se crea 1 de {n}. Envíala y vuelve a Resolver para la siguiente.', { n: missing.length }), 'warn');
        return propose('harden', missing.slice(0, n).map((x) => buildSetFlag(a.address, x.asf)));
      }
    }
  };

  return (
    <Screen title={t('Seguridad · {x}', { x: a.label })} onBack={nav.pop}>
      <View style={{ alignItems: 'center', paddingVertical: SP.md }}>
        <QuorumRing
          size={150}
          segments={list ? list.entries.map((e) => ({ weight: e.weight, on: true })) : [{ weight: 1, on: false }]}
          center={list ? `${minSigners(list)}/${list.entries.length}` : '—'}
          sub={list ? t('quórum {n}', { n: list.quorum }) : 'sin firmantes'}
        />
        <Txt v="h2" style={{ marginTop: SP.md }}>
          {h.summary}
        </Txt>
        {list && (
          <Txt v="small">
            {lossTolerance(list) === 1 ? t('Tolera perder 1 dispositivo') : t('Tolera perder {n} dispositivos', { n: lossTolerance(list) })}
          </Txt>
        )}
      </View>

      <Card>
        {h.checks.map((c) => (
          <Pressable key={c.key} disabled={c.ok || !c.fix} onPress={() => fix(c)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 }}>
            <Feather name={c.ok ? 'check-circle' : 'alert-circle'} size={20} color={c.ok ? C.green : C.warn} />
            <View style={{ flex: 1 }}>
              <Txt v="body">{c.label}</Txt>
              {c.detail ? <Txt v="small">{c.detail}</Txt> : null}
            </View>
            {!c.ok && c.fix ? (busy === c.fix ? <Badge text="…" /> : <Txt v="label" color={C.green}>Resolver</Txt>) : null}
          </Pressable>
        ))}
      </Card>

      <Section title="Firmantes">
        <Card style={{ paddingVertical: 4 }}>
          {list?.entries.map((e) => {
            const d = app.deviceFor(e.account);
            const c = app.contacts.find((x) => x.address === e.account);
            return (
              <ListItem
                key={e.account}
                icon={d?.kind === 'ledger' ? 'cpu' : d?.kind === 'tangem' ? 'credit-card' : 'smartphone'}
                iconColor={d ? C.green : C.dim}
                title={d?.label ?? c?.label ?? 'Firmante externo'}
                subtitle={`${d ? t('En este teléfono') : t('En otro teléfono')} · ${e.account.slice(0, 6)}…${e.account.slice(-4)}`}
                right={<Badge text={t('peso {n}', { n: e.weight })} color={C.dim} />}
              />
            );
          }) ?? <Txt v="small" style={{ padding: SP.md }}>Sin firmantes todavía.</Txt>}
        </Card>
        <Button title={list ? 'Cambiar firmantes o quórum' : 'Configurar firmantes'} kind="secondary" icon="users" onPress={() => nav.push('vaultWizard', { id: a.id })} />
      </Section>

      {st?.exists !== false && (
        <Section title="Protecciones">
          <Card style={{ paddingVertical: 4 }}>
            <Txt v="small" style={{ paddingTop: SP.sm }}>
              {t('Bloquean lo que terceros pueden enviar a esta bóveda sin tu permiso. Cada cambio es una operación firmada por el quórum.')}
            </Txt>
            {HARDENING.map((h) => {
              const on = !!st?.hardening.find((x) => x.asf === h.asf)?.on;
              const pend = pendingFlag(h.asf);
              return (
                <ListItem
                  key={h.asf}
                  icon={on ? 'shield' : 'shield-off'}
                  iconColor={on ? C.green : C.warn}
                  title={t(h.name)}
                  subtitle={pend ? t('Cambio pendiente de firmas · toca para verlo') : on ? t('Bloqueado') : t('Permitido')}
                  onPress={pend ? () => nav.push('proposal', { id: pend.id }) : undefined}
                  right={
                    busy === `flag${h.asf}` ? (
                      <Badge text="…" />
                    ) : (
                      <Switch
                        value={on}
                        disabled={!!busy || !!pend || !st}
                        onValueChange={(v) => toggleFlag(h.asf, v)}
                        trackColor={{ true: C.greenDeep, false: C.line }}
                        thumbColor={C.text}
                        accessibilityLabel={t(h.label)}
                      />
                    )
                  }
                />
              );
            })}
          </Card>
        </Section>
      )}

      <Section title="Firmas en paralelo">
        <Card>
          <Txt v="body">{st?.tickets.length ? t('{n} tickets disponibles', { n: st.tickets.length }) : 'Sin tickets'}</Txt>
          <Txt v="small">Cada ticket permite una operación pendiente más sin que choquen entre sí.</Txt>
          <Button title="Crear 5 tickets" kind="secondary" busy={busy === 'tickets'} onPress={() => propose('tickets', [buildTicketCreate(a.address, 5)])} />
        </Card>
      </Section>

      <Section title="Destinos permitidos">
        <Card>
          <Txt v="small" style={{ marginBottom: SP.sm }}>
            Tus otras cuentas siempre están permitidas. Enviar a cualquier otra dirección pide una confirmación reforzada.
          </Txt>
          {(a.allowed ?? []).map((addr) => (
            <ListItem
              key={addr}
              icon="check"
              title={app.contacts.find((c) => c.address === addr)?.label ?? `${addr.slice(0, 8)}…${addr.slice(-6)}`}
              subtitle={addr}
              right={
                <Pressable onPress={() => app.updateAccount(a.id, { allowed: (a.allowed ?? []).filter((x) => x !== addr) })} hitSlop={8}>
                  <Feather name="x" size={18} color={C.faint} />
                </Pressable>
              }
            />
          ))}
          <Button
            title="Permitir un destino"
            kind="secondary"
            icon="plus"
            onPress={() =>
              scanner.open((addr: string) => {
                if (!(a.allowed ?? []).includes(addr)) app.updateAccount(a.id, { allowed: [...(a.allowed ?? []), addr] });
              })
            }
          />
          {scanner.modal}
        </Card>
      </Section>

      {a.origin === 'quorum' ? (
        <Section title="Avanzado">
          <Notice kind="info">
            Bóveda creada en Quorum: por regla de Quorum no puede volver a cuenta normal. Para salir, mueve los fondos con multifirma a otra cuenta.
          </Notice>
        </Section>
      ) : (
        <Section title="Avanzado">
          <Card style={{ paddingVertical: 4 }}>
            <ListItem
              icon="rotate-ccw"
              title="Volver a cuenta normal"
              subtitle="Reactiva la master key y quita la multifirma, paso a paso"
              onPress={() => nav.push('unvault', { id: a.id })}
            />
          </Card>
        </Section>
      )}

      <Notice kind="info">
        {a.origin === 'quorum'
          ? 'Quorum no guarda claves: arma cada operación, la verifica y la envía. Los números secretos de esta bóveda solo se usaron para configurarla; las firmas del día a día ocurren en tus Tangem, Ledger o Xaman.'
          : 'Quorum nunca tiene tus claves: arma cada operación, la verifica y la envía. Las firmas ocurren dentro de tus Tangem, Ledger o Xaman.'}
      </Notice>
    </Screen>
  );
}
