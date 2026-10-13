import React, { useEffect, useState } from 'react';
import { t, locale } from '../i18n';
import { Alert, Pressable, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { isValidClassicAddress } from 'ripple-address-codec';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Address, Badge, BusySheet, Button, Card, Empty, Field, ListItem, Notice, Screen, Section, Txt, success, toast } from '../ui/components';
import { C, F, SP } from '../ui/theme';
import { KIND_LABEL, LEDGER_XRP_PATH, SignerDevice, SignerKind } from '../signers/types';
import { scanTangem, TangemCandidate } from '../signers/tangem';
import { scanLedgers, ledgerGetAddress, LedgerFound } from '../signers/ledger';
import { isNfcAvailable, tangemNativeLoaded } from '../../modules/tangem-nfc';
import { newId } from '../store';
import { NetworkId, fetchAccountState } from '../core/network';

export const DEVICE_ICON: Record<SignerKind, React.ComponentProps<typeof Feather>['name']> = {
  tangem: 'credit-card',
  ledger: 'cpu',
  xaman: 'smartphone',
};

export function DevicesScreen() {
  const app = useApp();
  const nav = useNav();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState('');

  const usage = (d: SignerDevice) => {
    const roles: string[] = [];
    for (const a of app.accounts) {
      const st = app.stateOf(a);
      if (a.address === d.address) roles.push(a.kind === 'vault' ? `Crea ${a.label}` : `Firma ${a.label}`);
      if (st?.signerList?.entries.some((e) => e.account === d.address)) roles.push(t('Firmante de {x}', { x: a.label }));
    }
    return roles;
  };

  return (
    <Screen title="Dispositivos" onBack={nav.pop}>
      <Txt v="small" style={{ marginBottom: SP.lg }}>
        Aquí solo se guardan direcciones y claves públicas. Las claves privadas nunca salen de cada dispositivo.
      </Txt>
      <View style={{ flexDirection: 'row', gap: SP.sm }}>
        {(['tangem', 'ledger', 'xaman'] as SignerKind[]).map((k) => (
          <Card key={k} onPress={() => nav.push('addDevice', { kind: k })} style={{ flex: 1, alignItems: 'center', paddingVertical: SP.lg }}>
            <Feather name={DEVICE_ICON[k]} size={22} color={C.green} />
            <Txt v="label" color={C.text} style={{ marginTop: 6 }}>
              {KIND_LABEL[k]}
            </Txt>
          </Card>
        ))}
      </View>

      {app.devices.length === 0 ? (
        <Empty icon="key" title="Sin dispositivos" text="Agrega tus tarjetas Tangem, tu Ledger o una cuenta Xaman." />
      ) : (
        <Section title={`Registrados (${app.devices.length})`}>
          {app.devices.map((d) => (
            <Card key={d.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: C.greenGlow, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={DEVICE_ICON[d.kind]} size={20} color={C.green} />
                </View>
                <View style={{ flex: 1 }}>
                  {editing === d.id ? (
                    <TextInput
                      value={name}
                      onChangeText={setName}
                      autoFocus
                      onSubmitEditing={async () => {
                        if (name.trim()) await app.updateDevice(d.id, { label: name.trim() });
                        setEditing(null);
                      }}
                      onBlur={() => setEditing(null)}
                      style={{ fontFamily: F.semibold, fontSize: 16, color: C.text, borderBottomWidth: 1, borderColor: C.green, paddingVertical: 2 }}
                    />
                  ) : (
                    <Txt v="h3">{d.label}</Txt>
                  )}
                  <Txt v="small">{KIND_LABEL[d.kind]}{d.tangem?.derivationPath ? ` · ${d.tangem.derivationPath}` : ''}</Txt>
                </View>
                <Pressable
                  hitSlop={10}
                  onPress={() =>
                    Alert.alert(d.label, undefined, [
                      {
                        text: 'Cambiar nombre',
                        onPress: () => {
                          setName(d.label);
                          setEditing(d.id);
                        },
                      },
                      {
                        text: 'Quitar',
                        style: 'destructive',
                        onPress: () =>
                          Alert.alert('Quitar dispositivo', usage(d).length ? 'Sigue configurado en tus cuentas. Quitarlo solo impide firmar desde este teléfono.' : '¿Quitarlo de Quorum?', [
                            { text: 'Cancelar', style: 'cancel' },
                            { text: 'Quitar', style: 'destructive', onPress: () => app.removeDevice(d.id) },
                          ]),
                      },
                      { text: 'Cancelar', style: 'cancel' },
                    ])
                  }
                >
                  <Feather name="more-horizontal" size={20} color={C.dim} />
                </Pressable>
              </View>
              <View style={{ marginTop: SP.md }}>
                <Address value={d.address} />
              </View>
              {usage(d).length > 0 && (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: SP.sm }}>
                  {usage(d).map((u) => (
                    <Badge key={u} text={u} color={u.startsWith('Firmante') ? C.green : C.warn} />
                  ))}
                </View>
              )}
            </Card>
          ))}
        </Section>
      )}
    </Screen>
  );
}

/** Saldo de la dirección en mainnet y testnet, para reconocer la cuenta al agregarla. */
function AddressBalances({ address }: { address: string }) {
  const [bal, setBal] = useState<Record<NetworkId, string | null | undefined>>({ mainnet: undefined, testnet: undefined });
  useEffect(() => {
    let alive = true;
    (['mainnet', 'testnet'] as NetworkId[]).forEach(async (net) => {
      try {
        const st = await fetchAccountState(net, address);
        if (alive) setBal((b) => ({ ...b, [net]: st.exists ? st.balanceXrp : null }));
      } catch {
        if (alive) setBal((b) => ({ ...b, [net]: 'error' }));
      }
    });
    return () => {
      alive = false;
    };
  }, [address]);
  const fmt = (v: string | null | undefined) =>
    v === undefined ? '…' : v === null ? 'no activada' : v === 'error' ? 'sin conexión' : `${Number(v).toLocaleString(locale(), { maximumFractionDigits: 6 })} XRP`;
  return (
    <View style={{ flexDirection: 'row', gap: SP.md, marginTop: 6, flexWrap: 'wrap' }}>
      <Txt v="small" color={bal.mainnet ? C.text : C.dim}>
        Mainnet: {fmt(bal.mainnet)}
      </Txt>
      <Txt v="small" color={bal.testnet ? C.test : C.dim}>
        Testnet: {fmt(bal.testnet)}
      </Txt>
    </View>
  );
}

export function AddDeviceScreen({ kind }: { kind: SignerKind }) {
  const app = useApp();
  const nav = useNav();
  const count = app.devices.filter((d) => d.kind === kind).length + 1;
  const [label, setLabel] = useState(`${KIND_LABEL[kind]} ${count}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [cands, setCands] = useState<TangemCandidate[]>([]);
  const [scanNotes, setScanNotes] = useState<string[]>([]);
  const [ledgers, setLedgers] = useState<LedgerFound[]>([]);
  const [picked, setPicked] = useState<{ dev: LedgerFound; address: string; publicKey: string } | null>(null);
  const [addr, setAddr] = useState('');

  const save = async (d: Omit<SignerDevice, 'id' | 'createdAt'>, close = true) => {
    try {
      await app.addDevice({ ...d, id: newId(), createdAt: Date.now() });
      success();
      if (close) nav.pop();
      else toast(`“${d.label}” agregada`);
    } catch (e: any) {
      Alert.alert('No se pudo guardar', e.message);
    }
  };

  return (
    <Screen title={`Agregar ${KIND_LABEL[kind]}`} onBack={nav.pop}>
      <BusySheet visible={!!busy} text={busy ?? ''} />
      <Field label="Nombre" value={label} onChangeText={setLabel} hint="Para reconocerlo al firmar, por ejemplo “Tangem caja fuerte”." />

      {kind === 'tangem' && (
        <>
          <Notice kind="info">
            Funciona con tarjetas Xaman y Tangem. Si la tarjeta es de un set con respaldo, todas las tarjetas del set comparten la clave: cuentan como un solo firmante.
          </Notice>
          {cands.length === 0 ? (
            <Button
              title="Escanear tarjeta"
              icon="credit-card"
              onPress={async () => {
                if (!tangemNativeLoaded) return Alert.alert('Tangem', 'Este build no incluye el módulo NFC.');
                if (!isNfcAvailable()) return Alert.alert('NFC', 'Este teléfono no tiene NFC disponible.');
                setBusy('Acerca la tarjeta a la parte superior del teléfono…');
                try {
                  const r = await scanTangem();
                  setCands(r.candidates);
                  setScanNotes(r.notes);
                } catch (e: any) {
                  Alert.alert('Tangem', e.message);
                } finally {
                  setBusy(null);
                }
              }}
            />
          ) : (
            <>
              <Txt v="label" style={{ marginVertical: SP.sm }}>
                {cands.length > 1 ? 'Esta tarjeta tiene varias direcciones XRP. Agrega la que coincide con la que ves en la app Tangem o Xaman.' : 'Dirección encontrada en la tarjeta'}
              </Txt>
              {cands.map((c, i) => {
                const added = app.devices.find((d) => d.address === c.address);
                return (
                  <Card key={c.address}>
                    <Address value={c.address} />
                    <Txt v="small" style={{ marginTop: 4 }}>
                      {c.note} · tarjeta {c.cardId}
                    </Txt>
                    <AddressBalances address={c.address} />
                    {added ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SP.md }}>
                        <Feather name="check-circle" size={16} color={C.green} />
                        <Txt v="small" color={C.green}>
                          Agregada como “{added.label}”
                        </Txt>
                      </View>
                    ) : (
                      <Button
                        title="Agregar esta dirección"
                        icon="plus"
                        onPress={() =>
                          save(
                            {
                              kind: 'tangem',
                              label: (cands.length > 1 && i > 0 ? `${label.trim()} · ${i + 1}` : label.trim()) || `Tangem ${count}`,
                              address: c.address,
                              publicKey: c.publicKey,
                              tangem: { cardId: c.cardId, walletPublicKey: c.walletPublicKey, derivationPath: c.derivationPath },
                            },
                            cands.length === 1,
                          )
                        }
                      />
                    )}
                  </Card>
                );
              })}
              {scanNotes.map((n) => (
                <Notice key={n} kind="info">
                  {n}
                </Notice>
              ))}
              <Button
                title="Volver a escanear"
                kind="ghost"
                icon="refresh-cw"
                onPress={() => {
                  setCands([]);
                  setScanNotes([]);
                }}
              />
              {cands.length > 1 && (
                <>
                  <Notice kind="warn">
                    Dos direcciones de la misma tarjeta son dos firmantes en papel, pero si pierdes o roban esa tarjeta, pierdes ambos. Para una bóveda segura, usa una dirección por tarjeta.
                  </Notice>
                  <Button title="Listo" kind="secondary" onPress={nav.pop} />
                </>
              )}
            </>
          )}
        </>
      )}

      {kind === 'ledger' && (
        <>
          <Notice kind="info">Ledger con Bluetooth (Nano X, Stax o Flex), desbloqueado y con la app XRP abierta. Un Ledger restaurado con la misma frase es el mismo firmante.</Notice>
          {!picked ? (
            <>
              <Button
                title="Buscar Ledger"
                icon="bluetooth"
                onPress={async () => {
                  setBusy('Buscando Ledger por Bluetooth…');
                  try {
                    const l = await scanLedgers();
                    setLedgers(l);
                    if (!l.length) Alert.alert('Ledger', 'No se encontró ninguno. Revisa que tenga Bluetooth activo y esté desbloqueado.');
                  } catch (e: any) {
                    Alert.alert('Ledger', e.message);
                  } finally {
                    setBusy(null);
                  }
                }}
              />
              {ledgers.map((d) => (
                <Card
                  key={d.id}
                  onPress={async () => {
                    setBusy('Confirma la dirección en la pantalla del Ledger…');
                    try {
                      const r = await ledgerGetAddress(d.id, LEDGER_XRP_PATH, true);
                      setPicked({ dev: d, ...r });
                    } catch (e: any) {
                      Alert.alert('Ledger', e.message);
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  <ListItem icon="cpu" title={d.name} />
                </Card>
              ))}
            </>
          ) : (
            <Card>
              <Txt v="label">Dirección confirmada en el dispositivo</Txt>
              <View style={{ marginTop: 6 }}>
                <Address value={picked.address} />
              </View>
              <AddressBalances address={picked.address} />
              <Button
                title="Guardar"
                onPress={() =>
                  save({
                    kind: 'ledger',
                    label: label.trim(),
                    address: picked.address,
                    publicKey: picked.publicKey,
                    ledger: { path: LEDGER_XRP_PATH, deviceId: picked.dev.id, deviceName: picked.dev.name },
                  })
                }
              />
            </Card>
          )}
        </>
      )}

      {kind === 'xaman' && (
        <>
          <Notice kind="info">Pega la dirección de la cuenta en Xaman. Al firmar, Quorum abre Xaman y espera tu aprobación. La primera firma del día te pide iniciar sesión en Xaman.</Notice>
          <Field
            label="Dirección"
            value={addr}
            onChangeText={setAddr}
            placeholder="r…"
            right={
              <Pressable style={{ padding: 6 }} onPress={() => nav.push('scan', { purpose: 'address', onAddress: (a: string) => setAddr(a) })}>
                <Feather name="maximize" size={18} color={C.green} />
              </Pressable>
            }
          />
          {isValidClassicAddress(addr.trim()) && <AddressBalances address={addr.trim()} />}
          <Button title="Guardar" disabled={!isValidClassicAddress(addr.trim())} onPress={() => save({ kind: 'xaman', label: label.trim(), address: addr.trim() })} />
        </>
      )}
    </Screen>
  );
}
