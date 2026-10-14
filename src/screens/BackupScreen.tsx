import React, { useState } from 'react';
import { t, locale } from '../i18n';
import { Alert, Switch, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import { Feather } from '@expo/vector-icons';
import { useConfigFingerprint } from './ReviewScreens';
import { useApp } from '../state';
import { useNav } from '../nav';
import { BusySheet, Button, Card, Field, Notice, Screen, Section, Txt, success, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { BackupData, inspectBackup, parseBackup, serializeBackup } from '../core/backup';
import { QUORUM } from '../config';

const INCLUDED = ['Dispositivos (direcciones y claves públicas)', 'Cuentas y bóvedas', 'Contactos', 'Operaciones pendientes y su historial', 'Moneda y preferencias de la app'];
const EXCLUDED = ['Sesión de Xaman', 'Códigos de tarjetas Tangem guardados con Face ID', 'Bloqueo con Face ID de la app', 'Emparejamiento Bluetooth del Ledger'];

function List({ items, icon, color }: { items: string[]; icon: 'check' | 'x'; color: string }) {
  return (
    <View>
      {items.map((t) => (
        <View key={t} style={{ flexDirection: 'row', gap: 8, paddingVertical: 3 }}>
          <Feather name={icon} size={14} color={color} style={{ marginTop: 3 }} />
          <Txt v="small" color={C.text} style={{ flex: 1 }}>
            {t}
          </Txt>
        </View>
      ))}
    </View>
  );
}

export default function BackupScreen() {
  const app = useApp();
  const nav = useNav();
  const [busy, setBusy] = useState<string | null>(null);

  // exportar
  const [protect, setProtect] = useState(true);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');

  // importar
  const [pending, setPending] = useState<{ text: string; encrypted: boolean; createdAt: string } | null>(null);
  const [ipw, setIpw] = useState('');

  const pwOk = !protect || (pw.length >= 8 && pw === pw2);

  // respaldo ya cifrado, listo para compartir o copiar (solo en memoria mientras estás en esta pantalla)
  const [exported, setExported] = useState<{ text: string; uri: string; protected: boolean } | null>(null);

  // para el recordatorio: cuándo se respaldó y qué configuración había
  const fingerprint = useConfigFingerprint();
  const [exportedHash, setExportedHash] = useState('');
  const markBackedUp = () => app.updateSettings({ backupAt: Date.now(), backupHash: exportedHash || fingerprint() });

  const doExport = async () => {
    setBusy(protect ? 'Cifrando respaldo…' : 'Preparando respaldo…');
    try {
      const text = await serializeBackup(app.backupData(), { password: protect ? pw : undefined, random: (n) => Crypto.getRandomBytes(n) });
      const day = new Date().toISOString().slice(0, 10);
      const f = new File(Paths.cache, `${t('quorum-respaldo')}-${day}.json`);
      f.create({ overwrite: true });
      f.write(text);
      setExported({ text, uri: f.uri, protected: protect });
      setExportedHash(fingerprint());
      setPw('');
      setPw2('');
      success();
    } catch (e: any) {
      Alert.alert('No se pudo exportar', e?.message ?? String(e));
    } finally {
      setBusy(null);
    }
  };

  // iOS no abre el menú de compartir mientras se cierra otra ventana (la de "Cifrando…"):
  // por eso compartir es un paso aparte, con su propio botón.
  const shareExported = async () => {
    if (!exported) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(exported.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Guardar respaldo de Quorum' });
        await markBackedUp();
      } else {
        await copyExported();
      }
    } catch (e: any) {
      Alert.alert('No se pudo compartir', e?.message ?? String(e));
    }
  };

  const copyExported = async () => {
    if (!exported) return;
    await Clipboard.setStringAsync(exported.text);
    await markBackedUp();
    success();
    toast(t('Respaldo copiado al portapapeles'));
  };

  const load = (text: string) => {
    try {
      const h = inspectBackup(text);
      setPending({ text, ...h });
      setIpw('');
    } catch (e: any) {
      Alert.alert('Respaldo', e.message);
    }
  };

  const pickFile = async () => {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
      if (r.canceled || !r.assets?.[0]) return;
      load(await new File(r.assets[0].uri).text());
    } catch (e: any) {
      Alert.alert('No se pudo leer', e?.message ?? String(e));
    }
  };

  const pasteText = async () => {
    const t = await Clipboard.getStringAsync();
    if (!t) return Alert.alert('Portapapeles vacío', 'Copia primero el contenido del respaldo.');
    load(t);
  };

  const doImport = async () => {
    if (!pending) return;
    setBusy(pending.encrypted ? 'Descifrando respaldo…' : 'Leyendo respaldo…');
    let data: BackupData;
    try {
      data = await parseBackup(pending.text, pending.encrypted ? ipw : undefined);
    } catch (e: any) {
      setBusy(null);
      return Alert.alert('Respaldo', e.message);
    }
    setBusy(null);
    Alert.alert(
      'Importar respaldo',
      t('Trae {a} cuenta(s), {d} dispositivo(s), {c} contacto(s) y {p} operación(es).\n\nSe agregan a lo que ya tienes; nada de este teléfono se borra ni se reemplaza.', { a: data.accounts.length, d: data.devices.length, c: data.contacts.length, p: data.proposals.length }),
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Importar',
          onPress: async () => {
            setBusy('Importando…');
            try {
              const n = await app.importBackup(data);
              success();
              setPending(null);
              const total = n.accounts + n.devices + n.contacts + n.proposals;
              Alert.alert(
                'Listo',
                total
                  ? t('Se agregaron {a} cuenta(s), {d} dispositivo(s), {c} contacto(s) y {p} operación(es).\n\nEn este teléfono tendrás que volver a conectar Xaman y escribir una vez el código de cada Tangem.', { a: n.accounts, d: n.devices, c: n.contacts, p: n.proposals })
                  : 'Todo lo del respaldo ya estaba en este teléfono.',
              );
            } catch (e: any) {
              Alert.alert('No se pudo importar', e?.message ?? String(e));
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <Screen title="Respaldo" onBack={nav.pop}>
      <BusySheet visible={!!busy} text={busy ?? ''} />
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
        Pasa tu configuración de Quorum a otro teléfono. El respaldo no contiene claves privadas: sin tus Tangem, Ledger o Xaman nadie puede mover fondos con él.
      </Txt>

      <Card>
        <Txt v="label" style={{ marginBottom: 4 }}>
          Incluye
        </Txt>
        <List items={INCLUDED} icon="check" color={C.green} />
        <Txt v="label" style={{ marginTop: SP.md, marginBottom: 4 }}>
          No incluye (se configura de nuevo en cada teléfono)
        </Txt>
        <List items={EXCLUDED} icon="x" color={C.faint} />
      </Card>

      <Section title="Exportar">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <Txt v="body">Proteger con contraseña</Txt>
              <Txt v="small">Recomendado: el respaldo revela tus direcciones y la estructura de tus bóvedas.</Txt>
            </View>
            <Switch value={protect} onValueChange={setProtect} trackColor={{ true: C.green }} />
          </View>
          {protect && (
            <View style={{ marginTop: SP.md }}>
              <Field label="Contraseña (mínimo 8 caracteres)" value={pw} onChangeText={setPw} secureTextEntry />
              <Field
                label="Repetir contraseña"
                value={pw2}
                onChangeText={setPw2}
                secureTextEntry
                error={pw2 && pw !== pw2 ? 'No coinciden' : undefined}
              />
              <Txt v="small">Si la olvidas, el respaldo no se puede abrir.</Txt>
            </View>
          )}
          {exported ? (
            <View style={{ marginTop: SP.sm }}>
              <Notice kind="info">
                {exported.protected ? 'Respaldo listo y cifrado con tu contraseña.' : 'Respaldo listo (sin contraseña).'}
              </Notice>
              <Button title="Compartir archivo" icon="share" onPress={shareExported} />
              <Button title="Copiar al portapapeles" kind="ghost" icon="copy" onPress={copyExported} />
              <Txt v="small" style={{ marginTop: 6 }}>
                Compartir: AirDrop, Archivos, iCloud o correo. Copiar: lo pegas en el otro teléfono o en quorumxrpl.com/view (con el portapapeles compartido de Apple, se copia directo al Mac).
              </Txt>
              <Button title="Hacer otro respaldo" kind="ghost" onPress={() => setExported(null)} />
            </View>
          ) : (
            <>
              <Button title="Exportar respaldo" icon="upload" disabled={!pwOk} onPress={doExport} />
              <Txt v="small" style={{ marginTop: 6 }}>
                Después podrás compartir el archivo o copiarlo al portapapeles.
              </Txt>
            </>
          )}
        </Card>
      </Section>

      <Section title="Ver en el computador">
        <Card>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <Feather name="monitor" size={20} color={C.green} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Txt v="body">Solo lectura, en el navegador</Txt>
              <Txt v="small">
                Exporta un respaldo con contraseña, envíatelo al computador y ábrelo en quorumxrpl.com/view. Verás tus bóvedas, cuentas, firmantes y actividad, sin poder firmar ni cambiar nada. El archivo se abre en el navegador: no pasa por ningún servidor.
              </Txt>
            </View>
          </View>
          <Button
            title="Copiar enlace"
            kind="ghost"
            icon="link"
            onPress={async () => {
              await Clipboard.setStringAsync(`${QUORUM.website}/view/`);
              toast(t('Enlace copiado'));
            }}
          />
        </Card>
      </Section>

      <Section title="Importar">
        {!pending ? (
          <Card>
            <Button title="Elegir archivo de respaldo" icon="download" onPress={pickFile} />
            <Button title="Pegar desde el portapapeles" kind="ghost" icon="clipboard" onPress={pasteText} />
          </Card>
        ) : (
          <Card>
            <Txt v="body">Respaldo del {new Date(pending.createdAt).toLocaleString(locale())}</Txt>
            {pending.encrypted ? (
              <Field label="Contraseña del respaldo" value={ipw} onChangeText={setIpw} secureTextEntry />
            ) : (
              <Notice kind="info">Este respaldo no tiene contraseña.</Notice>
            )}
            <Button title="Continuar" icon="arrow-right" disabled={pending.encrypted && !ipw} onPress={doImport} />
            <Button title="Cancelar" kind="ghost" onPress={() => setPending(null)} />
          </Card>
        )}
      </Section>
    </Screen>
  );
}
