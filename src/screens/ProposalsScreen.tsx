import React from 'react';
import { View } from 'react-native';
import { useApp, signedWeight } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Card, Empty, ListItem, Screen, Section, Txt, toast } from '../ui/components';
import * as Clipboard from 'expo-clipboard';
import { t } from '../i18n';
import { parseSharedProposal } from '../core/share';
import { parsePayRequest } from '../core/payRequest';
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

  // Operación compartida por mensaje: se copia el enlace (o el mensaje completo) y se pega aquí.
  const paste = async () => {
    const text = await Clipboard.getStringAsync().catch(() => '');
    const req = parsePayRequest(text);
    if (req) return nav.push('payRequest', { req });
    const s = parseSharedProposal(text);
    if (!s) return toast('No hay un enlace de operación de Quorum copiado', 'warn');
    try {
      const r = await app.importQr(s.qr, { from: s.from, note: s.note });
      toast(r.isNew ? 'Operación recibida' : r.added > 0 ? r.added > 1 ? t('{n} firmas agregadas', { n: r.added }) : t('1 firma agregada') : 'Sin firmas nuevas', r.added > 0 || r.isNew ? 'ok' : 'warn');
      nav.push('proposal', { id: r.proposal.id });
    } catch (e: any) {
      toast(e?.message ?? String(e), 'bad');
    }
  };

  return (
    <Screen>
      <Txt v="h1" style={{ marginBottom: SP.sm }}>
        Firmas
      </Txt>
      <Txt v="small" style={{ marginBottom: SP.lg }}>
        Operaciones de tus bóvedas que esperan firmas. Para firmar algo que viene de otro teléfono, escanea su QR o abre el enlace que te enviaron.
      </Txt>
      <View style={{ flexDirection: 'row', gap: SP.md }}>
        <Button title="Escanear QR" icon="maximize" style={{ flex: 1 }} onPress={() => nav.push('scan', { purpose: 'any' })} />
        <Button title="Pegar enlace" icon="clipboard" kind="secondary" style={{ flex: 1 }} onPress={paste} />
      </View>
      {pending.length === 0 ? (
        <Empty icon="check-circle" title="Nada pendiente" text="Cuando una bóveda necesite firmas, aparecerá aquí." />
      ) : (
        <Section title="Pendientes">{pending.map(item)}</Section>
      )}
      {done.length > 0 && <Section title="Historial">{done.map(item)}</Section>}
    </Screen>
  );
}
