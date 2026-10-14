import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Alert, Linking, Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { isValidClassicAddress } from 'ripple-address-codec';
import Constants from 'expo-constants';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Button, Card, Field, ListItem, Logo, Notice, Screen, Section, Segmented, Txt, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { FIATS, Fiat } from '../core/market';
import { sessionValid } from '../signers/xaman';
import { tangemNativeLoaded, isNfcAvailable, clearSavedTangemCodes } from '../../modules/tangem-nfc';
import { newId } from '../store';
import { lookalikeOf, trustedAddresses } from '../core/lookalike';
import { useBackupState } from './ReviewScreens';
import { hasGlass } from '../ui/Glass';

export default function SettingsScreen() {
  const app = useApp();
  const nav = useNav();
  const [testing, setTesting] = useState(false);
  const xOk = sessionValid(app.xaman);
  const xHours = app.xaman ? Math.max(0, Math.round((app.xaman.exp - Date.now()) / 3_600_000)) : 0;

  const toggleLock = async (v: boolean) => {
    if (v) {
      const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
      if (!ok) return Alert.alert('Face ID', 'Configura Face ID o un código en el teléfono primero.');
      // confirma que funciona antes de activarlo (y obtiene el permiso de Face ID)
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Activar bloqueo de Quorum' });
      if (!r.success) return;
    } else {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Desactivar bloqueo de Quorum' });
      if (!r.success) return;
    }
    app.updateSettings({ lockEnabled: v });
  };

  return (
    <Screen>
      <Txt v="h1" style={{ marginBottom: SP.lg }}>
        Ajustes
      </Txt>

      <Section title="Divisa">
        <Segmented<Fiat> value={app.settings.fiat} onChange={(f) => app.updateSettings({ fiat: f })} options={FIATS.map((f) => ({ value: f.value, label: f.label }))} />
      </Section>

      <Section title="Apariencia e idioma">
        <Txt v="label" style={{ marginBottom: 6 }}>
          Apariencia
        </Txt>
        <Segmented
          value={app.settings.appearance ?? 'system'}
          defer
          onChange={(v) => app.updateSettings({ appearance: v })}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'dark', label: 'Oscuro' },
            { value: 'light', label: 'Claro' },
          ]}
        />
        <Txt v="label" style={{ marginBottom: 6 }}>
          Idioma
        </Txt>
        <Segmented
          value={app.settings.language ?? 'system'}
          defer
          onChange={(v) => app.updateSettings({ language: v })}
          options={[
            { value: 'system', label: 'Sistema' },
            { value: 'es', label: 'Español' },
            { value: 'en', label: 'English' },
          ]}
        />
        {hasGlass() && (
          <Card style={{ paddingVertical: 4 }}>
            <ListItem
              icon="droplet"
              title="Selectores con Liquid Glass"
              subtitle="Usa los selectores de iOS 26 en vez de los de Quorum"
              right={
                <Switch
                  value={!!app.settings.nativeSelectors}
                  onValueChange={(v) => app.updateSettings({ nativeSelectors: v })}
                  trackColor={{ true: C.greenDeep, false: C.line }}
                  thumbColor={C.text}
                />
              }
            />
          </Card>
        )}
      </Section>

      <Section title="Seguridad">
        <Card style={{ paddingVertical: 4 }}>
          <ListItem
            icon="lock"
            title="Bloqueo con Face ID"
            subtitle="Al abrir Quorum y al volver a la app"
            right={<Switch value={app.settings.lockEnabled} onValueChange={toggleLock} trackColor={{ true: C.greenDeep, false: C.line }} thumbColor={C.text} />}
          />
          <ListItem
            icon="activity"
            title="Vibraciones"
            subtitle="Al tocar botones y confirmar operaciones"
            right={
              <Switch
                value={app.settings.haptics !== false}
                onValueChange={(v) => {
                  app.updateSettings({ haptics: v });
                }}
                trackColor={{ true: C.greenDeep, false: C.line }}
                thumbColor={C.text}
              />
            }
          />
          {app.settings.lockEnabled && (
            <View style={{ paddingVertical: SP.sm }}>
              <Txt v="small" style={{ marginBottom: 6 }}>
                Pedir Face ID al volver
              </Txt>
              <Segmented
                value={String(app.settings.lockAfterSec ?? 0)}
                onChange={(v) => app.updateSettings({ lockAfterSec: Number(v) })}
                options={[
                  { value: '0', label: 'Siempre' },
                  { value: '60', label: 'Tras 1 min' },
                  { value: '300', label: 'Tras 5 min' },
                ]}
              />
            </View>
          )}
          <ListItem
            icon="eye-off"
            title="Ocultar saldos"
            right={
              <Switch
                value={app.settings.hideBalances}
                onValueChange={(v) => app.updateSettings({ hideBalances: v })}
                trackColor={{ true: C.greenDeep, false: C.line }}
                thumbColor={C.text}
              />
            }
          />
          <ListItem icon="key" title="Dispositivos de firma" subtitle={app.devices.length === 1 ? t('1 registrado') : t('{n} registrados', { n: app.devices.length })} onPress={() => nav.push('devices', {})} />
          <ListItem icon="book" title="Contactos" subtitle={app.contacts.length === 1 ? t('1 guardado') : t('{n} guardados', { n: app.contacts.length })} onPress={() => nav.push('contacts', {})} />
        </Card>
      </Section>

      <Section title="Xaman">
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="smartphone" size={18} color={xOk ? C.green : C.dim} />
            <View style={{ flex: 1 }}>
              <Txt v="body">{xOk ? 'Sesión activa' : 'Sin sesión'}</Txt>
              <Txt v="small">
                {xOk
                  ? `${app.xaman?.account ? `${app.xaman.account.slice(0, 6)}…${app.xaman.account.slice(-4)} · ` : ''}${t('vence en {n} h', { n: xHours })}`
                  : 'Se pide automáticamente al firmar con Xaman'}
              </Txt>
            </View>
          </View>
          <Txt v="small" style={{ marginTop: SP.md }}>
            Quorum se conecta a Xaman iniciando sesión dentro de Xaman, sin claves ni secretos guardados en la app. La sesión dura 24 horas; después Xaman te pedirá aprobar de nuevo.
          </Txt>
          {xOk ? (
            <Button title="Cerrar sesión de Xaman" kind="ghost" onPress={() => app.setXaman(null)} />
          ) : (
            <Button
              title="Conectar con Xaman"
              icon="log-in"
              busy={testing}
              onPress={async () => {
                setTesting(true);
                try {
                  const s = await app.ensureXaman();
                  toast(s.account ? t('Xaman conectado: {x}…', { x: s.account.slice(0, 8) }) : 'Xaman conectado');
                } catch (e: any) {
                  Alert.alert('Xaman', e.message);
                } finally {
                  setTesting(false);
                }
              }}
            />
          )}
        </Card>
      </Section>

      {tangemNativeLoaded && (
        <Section title="Tarjetas Tangem">
          <Card>
            <Txt v="body">Código de la tarjeta con Face ID</Txt>
            <Txt v="small" style={{ marginTop: 4 }}>
              La primera vez que usas una tarjeta con código, lo escribes y queda guardado en este teléfono, cifrado y protegido con Face ID. Después basta con Face ID y acercar la tarjeta.
            </Txt>
            <Button
              title="Olvidar códigos guardados"
              kind="ghost"
              icon="trash-2"
              onPress={() =>
                Alert.alert('Olvidar códigos', 'La próxima vez que uses cada tarjeta tendrás que escribir su código.', [
                  { text: 'Cancelar', style: 'cancel' },
                  { text: 'Olvidar', style: 'destructive', onPress: () => toast(clearSavedTangemCodes() ? 'Códigos olvidados' : 'No había códigos guardados') },
                ])
              }
            />
          </Card>
        </Section>
      )}

      <Section title="Respaldo">
        <Card style={{ paddingVertical: 4 }}>
          <ListItem icon="save" title="Exportar o importar" subtitle="Pasa tus cuentas y bóvedas a otro teléfono" onPress={() => nav.push('backup', {})} />
          <BackupHint />
        </Card>
      </Section>

      <Section title="Ayuda">
        <Card style={{ paddingVertical: 4 }}>
          <ListItem icon="book-open" title="Guía de ensayo en testnet" subtitle="Recorrido, Xaman en testnet y XRP de prueba" onPress={() => nav.push('guide', {})} />
          <ListItem icon="shield" title="Volver a leer el aviso de inicio" subtitle="Responsabilidad y lo que Quorum nunca te pedirá" onPress={() => nav.push('terms', {})} />
        </Card>
      </Section>

      <Section title="Operaciones">
        <Card>
          <Txt v="body">Tiempo para juntar firmas</Txt>
          <Txt v="small" style={{ marginBottom: SP.sm }}>
            Si no se reúnen las firmas a tiempo, la operación vence y no puede usarse.
          </Txt>
          <Segmented
            value={String(app.settings.validityMinutes)}
            onChange={(v) => app.updateSettings({ validityMinutes: Number(v) })}
            options={[
              { value: '30', label: '30 min' },
              { value: '120', label: '2 h' },
              { value: '720', label: '12 h' },
              { value: '1440', label: '24 h' },
            ]}
          />
        </Card>
      </Section>

      <Section title="Acerca de">
        <Card onPress={() => nav.push('about', {})}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Logo size={40} />
            <View style={{ flex: 1 }}>
              <Txt v="h3">Quorum {Constants.expoConfig?.version ?? ''}</Txt>
              <Txt v="small">Sin fines de lucro · código abierto · Minify SpA</Txt>
            </View>
            <Feather name="chevron-right" size={20} color={C.dim} />
          </View>
          <Txt v="small" style={{ marginTop: SP.md }}>
            Autocustodia: Quorum nunca tiene acceso a tus claves ni a tus fondos. NFC Tangem: {tangemNativeLoaded ? (isNfcAvailable() ? 'disponible' : 'sin NFC') : 'no incluido'}.
          </Txt>
        </Card>
        <Button
          title="Borrar datos de Quorum"
          kind="danger"
          onPress={() =>
            Alert.alert('Borrar todo', 'Se borran cuentas, dispositivos, contactos y operaciones de este teléfono. Tus fondos no se ven afectados.', [
              { text: 'Cancelar', style: 'cancel' },
              { text: 'Borrar', style: 'destructive', onPress: () => app.resetApp() },
            ])
          }
        />
      </Section>
    </Screen>
  );
}

export function ContactsScreen() {
  const app = useApp();
  const nav = useNav();
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState('');
  const [tag, setTag] = useState('');
  return (
    <Screen title="Contactos" onBack={nav.pop}>
      <Card>
        <Field label="Nombre" value={label} onChangeText={setLabel} placeholder="Exchange, socio…" />
        <Field
          label="Dirección"
          value={addr}
          onChangeText={setAddr}
          placeholder="r…"
          right={
            <Pressable
              style={{ padding: 6 }}
              onPress={() =>
                nav.push('scan', {
                  purpose: 'address',
                  onAddress: (a: string, t?: string) => {
                    setAddr(a);
                    if (t) setTag(t);
                  },
                })
              }
            >
              <Feather name="maximize" size={18} color={C.green} />
            </Pressable>
          }
        />
        <Field label="Destination tag (opcional)" value={tag} onChangeText={setTag} keyboardType="number-pad" />
        <Button
          title="Guardar contacto"
          disabled={!label.trim() || !isValidClassicAddress(addr.trim())}
          onPress={() => {
            const save = async () => {
              await app.saveContact({ id: newId(), label: label.trim(), address: addr.trim(), tag: tag.trim() || undefined });
              setLabel('');
              setAddr('');
              setTag('');
              toast('Contacto guardado');
            };
            // ¿se parece a una dirección de confianza sin serlo? (estafa de direcciones parecidas)
            const twin = lookalikeOf(addr.trim(), trustedAddresses(app));
            if (!twin) return save();
            Alert.alert(
              'Dirección parecida, no igual',
              t('Esta dirección se parece a «{l}» ({k}), pero no es la misma. Si la copiaste desde tu actividad, puede ser una estafa de direcciones parecidas.', {
                l: twin.label,
                k: `${twin.address.slice(0, 6)}…${twin.address.slice(-6)}`,
              }),
              [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Guardar igual', style: 'destructive', onPress: save },
              ],
            );
          }}
        />
      </Card>
      {app.contacts.map((c) => (
        <Card key={c.id} style={{ paddingVertical: 4 }}>
          <ListItem
            icon="user"
            title={c.label}
            subtitle={`${c.address.slice(0, 10)}…${c.address.slice(-6)}${c.tag ? ` · tag ${c.tag}` : ''}`}
            right={
              <Pressable hitSlop={10} onPress={() => app.removeContact(c.id)}>
                <Feather name="trash-2" size={18} color={C.faint} />
              </Pressable>
            }
          />
        </Card>
      ))}
      {app.contacts.length === 0 && <Notice kind="info">Guarda direcciones frecuentes para no copiarlas a mano.</Notice>}
    </Screen>
  );
}

/** Estado del respaldo bajo "Exportar o importar" (solo si falta o está desactualizado). */
function BackupHint() {
  const b = useBackupState();
  if (b.kind === 'empty' || b.kind === 'ok') return null;
  const text =
    b.kind === 'never'
      ? t('Aún no tienes un respaldo')
      : b.kind === 'changed'
        ? t('Tienes cambios sin respaldar')
        : t('Tu respaldo tiene {n} días', { n: b.days });
  return (
    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: SP.md, paddingBottom: SP.md }}>
      <Feather name="alert-circle" size={14} color={C.warn} />
      <Txt v="small" color={C.warn}>
        {text}
      </Txt>
    </View>
  );
}
