import React, { useMemo, useState } from 'react';
import { t } from '../i18n';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { useMoney } from '../ui/money';
import { Address, Button, Card, Field, ListItem, Logo, Notice, Screen, Section, Txt, tap } from '../ui/components';
import { C, F, R, SP } from '../ui/theme';
import { QUORUM } from '../config';
import { NeverAskCard, ResponsibilityList } from '../ui/legalBlocks';
import { buildDonation, DONATION_LIMITS } from '../core/tx';

const PRINCIPLES: { icon: React.ComponentProps<typeof Feather>['name']; title: string; text: string }[] = [
  {
    icon: 'heart',
    title: 'Sin fines de lucro',
    text: 'Quorum es gratis. Sin publicidad, sin comisiones y sin planes pagados. Se sostiene con donaciones voluntarias.',
  },
  {
    icon: 'code',
    title: 'Código abierto',
    text: 'El código de Quorum será público para que cualquiera pueda revisarlo, auditarlo y compilarlo por su cuenta.',
  },
  {
    icon: 'eye-off',
    title: 'No guardamos nada tuyo',
    text: 'No hay servidores de Quorum ni cuentas de usuario. Tus cuentas, dispositivos, contactos y operaciones viven solo en este teléfono.',
  },
  {
    icon: 'key',
    title: 'Autocustodia',
    text: 'Quorum no guarda claves privadas. Las firmas del día a día ocurren dentro de tu Tangem, Ledger o Xaman. Si creas una bóveda en Quorum, sus números secretos se generan en el teléfono, se muestran una vez y nunca se guardan.',
  },
];

const CONNECTIONS = [
  'Nodos públicos del XRP Ledger, para leer saldos y enviar transacciones.',
  'CoinGecko, solo para el precio de XRP.',
  'Gateways IPFS, para mostrar imágenes de NFTs.',
  'Xaman, únicamente si firmas con una cuenta Xaman (inicio de sesión dentro de Xaman, sin secretos en la app).',
];

export default function AboutScreen() {
  const nav = useNav();
  const hasDonations = !!QUORUM.donationAddress;
  return (
    <Screen title="Acerca de Quorum" onBack={nav.pop}>
      <View style={{ alignItems: 'center', paddingVertical: SP.lg }}>
        <Logo size={84} />
        <Txt v="h1" style={{ marginTop: SP.lg }}>
          Quorum
        </Txt>
        <Txt v="small">Bóvedas multifirma para el XRP Ledger · versión {Constants.expoConfig?.version ?? ''}</Txt>
      </View>

      {hasDonations && (
        <Pressable
          onPress={() => nav.push('donate', {})}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: SP.md,
            padding: SP.lg,
            borderRadius: R.md,
            marginBottom: SP.md,
            backgroundColor: C.badBg,
            borderWidth: 1,
            borderColor: C.bad + '66',
            opacity: pressed ? 0.75 : 1,
          })}
        >
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.bad, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="heart" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Txt v="h3">Donar a Quorum</Txt>
            <Txt v="small">Quorum es gratis gracias a quienes lo apoyan. Dona en XRP desde cualquiera de tus cuentas.</Txt>
          </View>
          <Feather name="chevron-right" size={20} color={C.bad} />
        </Pressable>
      )}

      <Card>
        {PRINCIPLES.map((p) => (
          <View key={p.title} style={{ flexDirection: 'row', gap: SP.md, paddingVertical: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={p.icon} size={18} color={C.green} />
            </View>
            <View style={{ flex: 1 }}>
              <Txt v="h3">{p.title}</Txt>
              <Txt v="small">{p.text}</Txt>
            </View>
          </View>
        ))}
      </Card>

      <Section title="A qué se conecta la app">
        <Card>
          {CONNECTIONS.map((c) => (
            <View key={c} style={{ flexDirection: 'row', gap: 10, paddingVertical: 5 }}>
              <Feather name="arrow-right" size={14} color={C.dim} style={{ marginTop: 3 }} />
              <Txt v="small" color={C.text} style={{ flex: 1 }}>
                {c}
              </Txt>
            </View>
          ))}
          <Txt v="small" style={{ marginTop: SP.sm }}>
            Ninguno de estos servicios es de Quorum, y Quorum no les envía nada más que lo necesario para cada consulta.
          </Txt>
        </Card>
      </Section>

      <Section title="Responsabilidad">
        <Card>
          <ResponsibilityList />
        </Card>
      </Section>

      <Section title="Seguridad">
        <NeverAskCard />
        <Button title="Volver a leer el aviso de inicio" icon="book-open" kind="secondary" onPress={() => nav.push('terms', {})} />
      </Section>

      <Section title="Enlaces">
        <Card style={{ paddingVertical: 4 }}>
          <ListItem icon="globe" title="quorumxrpl.com" onPress={() => Linking.openURL(QUORUM.website)} />
          {QUORUM.sourceUrl ? <ListItem icon="github" title="Código fuente" onPress={() => Linking.openURL(QUORUM.sourceUrl)} /> : null}
        </Card>
      </Section>

      <Txt v="small" style={{ textAlign: 'center', marginTop: SP.xl }}>
        Hecho en Chile por {QUORUM.publisher}.
      </Txt>
    </Screen>
  );
}

export function DonateScreen() {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const sources = app.accounts.filter((a) => a.network === 'mainnet' && (app.deviceFor(a.address) || app.stateOf(a)?.signerList));
  const [srcId, setSrcId] = useState(sources[0]?.id);
  const [usd, setUsd] = useState<number | null>(QUORUM.donationUsd[1] ?? null);
  const [manual, setManual] = useState('');
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const usdPrice = app.price?.price.usd;
  // De USD a XRP, redondeado a XRP enteros hacia arriba (montos simples de leer)
  const xrpFor = (d: number) => (usdPrice ? Math.max(1, Math.ceil(d / usdPrice)) : null);
  const xrp = useMemo(() => {
    if (manual) {
      const n = Number(manual.replace(',', '.'));
      return n > 0 ? n : null;
    }
    return usd ? xrpFor(usd) : null;
  }, [usd, manual, usdPrice]);

  const src = sources.find((s) => s.id === srcId);

  const donate = async () => {
    if (!src || !xrp) return;
    setBusy(true);
    try {
      const tx = buildDonation(src.address, QUORUM.donationAddress, String(xrp), {
        tag: QUORUM.donationTag?.toString(),
        message,
        name,
      });
      const p = await app.createProposal(src, tx);
      nav.replace('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Donar a Quorum" onBack={nav.pop}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
        Quorum es gratis y sin fines de lucro. Las donaciones financian el desarrollo, las auditorías de seguridad y la publicación en las tiendas.
      </Txt>

      <Txt v="label" style={{ marginBottom: 6 }}>
        Monto
      </Txt>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: SP.md }}>
        {QUORUM.donationUsd.map((d) => {
          const on = usd === d && !manual;
          const x = xrpFor(d);
          return (
            <Pressable
              key={d}
              onPress={() => {
                tap();
                setUsd(d);
                setManual('');
              }}
              style={{ flexGrow: 1, minWidth: '22%', paddingVertical: 12, borderRadius: R.md, alignItems: 'center', backgroundColor: on ? C.green : C.raised }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 17, color: on ? C.greenInk : C.text }}>US$ {d}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 12, color: on ? C.greenInk : C.dim }}>{x ? `${x} XRP` : '…'}</Text>
            </Pressable>
          );
        })}
      </View>
      {QUORUM.donationArmyUsd ? (
        <Pressable
          onPress={() => {
            tap();
            setUsd(QUORUM.donationArmyUsd);
            setManual('');
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 14,
            borderRadius: R.md,
            marginBottom: SP.md,
            borderWidth: 1,
            borderColor: usd === QUORUM.donationArmyUsd && !manual ? C.green : C.line,
            backgroundColor: usd === QUORUM.donationArmyUsd && !manual ? C.greenGlow : C.raised,
          }}
        >
          <Feather name="award" size={22} color={C.green} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.bold, fontSize: 17, color: C.text }}>US$ {QUORUM.donationArmyUsd}</Text>
            <Txt v="small">Por la XRP Army · opcional</Txt>
          </View>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: C.dim }}>{xrpFor(QUORUM.donationArmyUsd) ? `${xrpFor(QUORUM.donationArmyUsd)} XRP` : '…'}</Text>
        </Pressable>
      ) : null}
      <Field label="Otro monto (XRP)" value={manual} onChangeText={setManual} keyboardType="decimal-pad" placeholder="Ej. 20" />

      <Field
        label="Mensaje (opcional)"
        value={message}
        onChangeText={(v) => setMessage(v.slice(0, DONATION_LIMITS.message))}
        placeholder="Gracias por Quorum…"
        multiline
        style={{ minHeight: 76, textAlignVertical: 'top', paddingTop: 12 }}
        hint={t('{n}/{m} · Se publica en el XRP Ledger y en quorumxrpl.com/donaciones.', { n: message.length, m: DONATION_LIMITS.message })}
      />
      <Field
        label="Tu nombre o alias (opcional)"
        value={name}
        onChangeText={(v) => setName(v.slice(0, DONATION_LIMITS.name))}
        placeholder="Anónimo"
        autoCapitalize="words"
      />
      <Txt v="small" style={{ marginTop: -4, marginBottom: SP.md }}>
        No escribas datos personales: los memos son públicos y quedan para siempre en la red.
      </Txt>

      {sources.length === 0 ? (
        <Notice kind="info">Agrega una cuenta de mainnet con su dispositivo para donar desde Quorum, o usa el QR de abajo desde cualquier billetera.</Notice>
      ) : (
        <>
          <Txt v="label" style={{ marginBottom: 6 }}>
            Desde
          </Txt>
          {sources.map((s) => (
            <Card key={s.id} onPress={() => setSrcId(s.id)} style={{ paddingVertical: 4, borderColor: s.id === srcId ? C.green : C.line }}>
              <ListItem
                icon={s.kind === 'vault' ? 'lock' : 'credit-card'}
                title={s.label}
                subtitle={app.stateOf(s) ? t('{n} XRP disponibles', { n: m.xrp(app.stateOf(s)!.spendableXrp) }) : ''}
                right={s.id === srcId ? <Feather name="check-circle" size={20} color={C.green} /> : undefined}
              />
            </Card>
          ))}
          <Button title={xrp ? `Donar ${xrp} XRP` : 'Elige un monto'} icon="heart" busy={busy} disabled={!xrp || !src} onPress={donate} />
        </>
      )}

      <Section title="Desde otra billetera">
        <Card style={{ alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', padding: 12, borderRadius: R.md }}>
            <QRCode value={QUORUM.donationAddress || 'quorum'} size={170} backgroundColor="#fff" color="#000" />
          </View>
          <View style={{ marginTop: SP.md }}>
            <Address value={QUORUM.donationAddress} label="Dirección de donación" />
          </View>
          {QUORUM.donationTag !== undefined && <Txt v="small">Destination tag: {QUORUM.donationTag}</Txt>}
        </Card>
      </Section>
    </Screen>
  );
}
