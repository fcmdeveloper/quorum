import React from 'react';
import { View } from 'react-native';
import { useApp, signedWeight } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Card, Empty, ListItem, Screen, Section, Txt } from '../ui/components';
import { C, SP } from '../ui/theme';
import { describeTx } from '../core/tx';
import { STATUS } from './ProposalScreen';

export default function ProposalsScreen() {
  const app = useApp();
  const nav = useNav();
  const pending = app.proposals.filter((p) => p.status === 'collecting' || p.status === 'ready');
  const done = app.proposals.filter((p) => !(p.status === 'collecting' || p.status === 'ready')).slice(0, 30);

  const item = (p: (typeof app.proposals)[number]) => {
    const acc = app.accountFor(p.network, p.account);
    const st = acc ? app.stateOf(acc) : app.stateAt(p.network, p.account);
    const s = STATUS[p.status];
    const w = signedWeight(p.signatures, st?.signerList);
    return (
      <Card key={p.id} onPress={() => nav.push('proposal', { id: p.id })} style={{ paddingVertical: 6 }}>
        <ListItem
          icon={p.tx.TransactionType === 'Payment' ? 'arrow-up-right' : 'sliders'}
          iconColor={s.color}
          title={describeTx(p.tx, p.network).title}
          subtitle={`${acc?.label ?? p.account.slice(0, 8) + '…'}${p.mode === 'multi' && st?.signerList ? ` · ${w}/${st.signerList.quorum}` : ''}`}
          right={<Badge text={s.text} color={s.color} />}
        />
      </Card>
    );
  };

  return (
    <Screen>
      <Txt v="h1" style={{ marginBottom: SP.sm }}>
        Firmas
      </Txt>
      <Txt v="small" style={{ marginBottom: SP.lg }}>
        Operaciones de tus bóvedas que esperan firmas. Para firmar algo que viene de otro teléfono, escanea su QR.
      </Txt>
      <Button title="Escanear QR de operación" icon="maximize" onPress={() => nav.push('scan', { purpose: 'any' })} />
      {pending.length === 0 ? (
        <Empty icon="check-circle" title="Nada pendiente" text="Cuando una bóveda necesite firmas, aparecerá aquí." />
      ) : (
        <Section title="Pendientes">{pending.map(item)}</Section>
      )}
      {done.length > 0 && <Section title="Historial">{done.map(item)}</Section>}
    </Screen>
  );
}
