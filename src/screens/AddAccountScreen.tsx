import React, { useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { isValidClassicAddress } from 'ripple-address-codec';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useAddressScanner } from '../ui/ScanView';
import { Button, Card, Field, ListItem, Screen, Segmented, Txt } from '../ui/components';
import { C, SP } from '../ui/theme';
import { NetworkId, fetchAccountState } from '../core/network';
import { KIND_LABEL } from '../signers/types';
import { DEVICE_ICON } from './DevicesScreen';
import { celebrate } from '../ui/Celebrate';

export default function AddAccountScreen() {
  const app = useApp();
  const nav = useNav();
  const scanner = useAddressScanner();
  const [network, setNetwork] = useState<NetworkId>('testnet');
  const [mode, setMode] = useState<'device' | 'address'>('device');
  const [addr, setAddr] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const add = async (address: string, name: string) => {
    setBusy(true);
    try {
      // Si la dirección ya tiene multifirma, se agrega como bóveda
      let kind: 'vault' | 'wallet' = 'wallet';
      try {
        const st = await fetchAccountState(network, address);
        if (st.signerList) kind = 'vault';
      } catch {}
      const acc = await app.addAccount({ label: name, kind, network, address, allowed: kind === 'vault' ? [] : undefined });
      app.refreshAccount(acc);
      nav.replace('account', { id: acc.id });
      celebrate(kind === 'vault' ? 'Bóveda agregada' : 'Cuenta agregada');
    } catch (e: any) {
      Alert.alert('No se pudo agregar', e.message);
    } finally {
      setBusy(false);
    }
  };

  const free = app.devices.filter((d) => !app.accounts.some((a) => a.address === d.address && a.network === network));

  return (
    <Screen title="Agregar cuenta" onBack={nav.pop}>
      <Txt v="label" style={{ marginBottom: 6 }}>
        Red
      </Txt>
      <Segmented
        value={network}
        onChange={setNetwork}
        options={[
          { value: 'testnet', label: 'Testnet' },
          { value: 'mainnet', label: 'Mainnet' },
        ]}
      />
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: 'device', label: 'De un dispositivo' },
          { value: 'address', label: 'Por dirección' },
        ]}
      />

      {mode === 'device' ? (
        <>
          <Txt v="small" style={{ marginBottom: SP.md }}>
            La cuenta de uno de tus dispositivos: podrás enviar firmando con él.
          </Txt>
          {free.map((d) => (
            <Card key={d.id} onPress={() => add(d.address, d.label)} style={{ paddingVertical: 6 }}>
              <ListItem icon={DEVICE_ICON[d.kind]} title={d.label} subtitle={`${KIND_LABEL[d.kind]} · ${d.address.slice(0, 6)}…${d.address.slice(-4)}`} />
            </Card>
          ))}
          <Button title="Registrar un dispositivo" kind="secondary" icon="plus" onPress={() => nav.push('devices', {})} />
        </>
      ) : (
        <>
          <Txt v="small" style={{ marginBottom: SP.md }}>
            Una bóveda creada en otro teléfono o cualquier cuenta para ver su saldo y actividad. Si es multifirma y tienes alguno de sus firmantes, podrás firmar.
          </Txt>
          <Field label="Nombre" value={label} onChangeText={setLabel} placeholder="Bóveda familia" />
          <Field
            label="Dirección"
            value={addr}
            onChangeText={setAddr}
            placeholder="r…"
            right={
              <>
                <Pressable style={{ padding: 6 }} onPress={() => scanner.open((a: string) => setAddr(a))}>
                  <Feather name="maximize" size={18} color={C.green} />
                </Pressable>
                {scanner.modal}
              </>
            }
          />
          <Button title="Agregar" busy={busy} disabled={!isValidClassicAddress(addr.trim()) || !label.trim()} onPress={() => add(addr.trim(), label.trim())} />
        </>
      )}

      <View style={{ height: SP.xl }} />
      <Card onPress={() => nav.replace('vaultWizard', {})}>
        <ListItem icon="lock" title="Crear una bóveda nueva" subtitle="Multifirma con tus dispositivos" />
      </Card>
    </Screen>
  );
}
