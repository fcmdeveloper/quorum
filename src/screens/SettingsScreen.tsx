import React, { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Alert, Linking, Platform, Pressable, Switch, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { isValidClassicAddress } from 'ripple-address-codec';
import Constants from 'expo-constants';
import { useApp } from '../state';
import { useNav } from '../nav';
import { useAddressScanner } from '../ui/ScanView';
import { Button, Card, Field, ListItem, Logo, Notice, Screen, Section, Segmented, Txt, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { FIATS, Fiat } from '../core/market';
import { sessionValid } from '../signers/xaman';
import { tangemNativeLoaded, isNfcAvailable, clearSavedTangemCodes } from '../../modules/tangem-nfc';
import { newId } from '../store';
import { lookalikeOf, trustedAddresses } from '../core/lookalike';
import { useBackupState } from './ReviewScreens';
import { hasGlass } from '../ui/Glass';
import { AppIconPicker } from '../ui/AppIconPicker';
import { PinSheet } from '../ui/PinSheet';
import { savePinRecord } from '../store';

export default function SettingsScreen() {
  const app = useApp();
  const nav = useNav();
  const [testing, setTesting] = useState(false);
  const xOk = sessionValid(app.xaman);
  const xHours = app.xaman ? Math.max(0, Math.round((app.xaman.exp - Date.now()) / 3_600_000)) : 0;

  // Bloqueo de la app: desactivado, Face ID (o el código del teléfono) o un código propio de 4 dígitos.
  type LockChoice = 'off' | 'faceid' | 'pin';
  const lockNow: LockChoice = !app.settings.lockEnabled ? 'off' : app.settings.lockMethod === 'pin' ? 'pin' : 'faceid';
  const [pinSheet, setPinSheet] = useState<null | { mode: 'create' | 'verify'; then: () => void }>(null);

  /** Confirma que es la persona dueña antes de cambiar o quitar el bloqueo. */
  const confirmCurrent = (then: () => void) => {
    if (lockNow === 'pin') return setPinSheet({ mode: 'verify', then });
    if (lockNow === 'faceid') {
      LocalAuthentication.authenticateAsync({ promptMessage: 'Cambiar el bloqueo de Quorum' }).then((r) => r.success && then());
      return;
    }
    then();
  };

  const chooseLock = (v: LockChoice) => {
    if (v === lockNow) return;
    confirmCurrent(async () => {
      if (v === 'off') {
        await savePinRecord(null);
        return app.updateSettings({ lockEnabled: false });
      }
      if (v === 'faceid') {
        const ok = (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
        if (!ok) return Alert.alert('Face ID', 'Configura Face ID o un código en el teléfono primero.');
        // confirma que funciona antes de activarlo (y obtiene el permiso de Face ID)
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Activar bloqueo de Quorum' });
        if (!r.success) return;
        await savePinRecord(null);
        return app.updateSettings({ lockEnabled: true, lockMethod: 'faceid' });
      }
      // código propio: se define dos veces
      setPinSheet({ mode: 'create', then: () => app.updateSettings({ lockEnabled: true, lockMethod: 'pin' }) });
    });
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
        <Txt v="label" style={{ marginBottom: 6 }}>
          Decimales en saldos
        </Txt>
        <Segmented
          value={app.settings.balanceDecimals ?? 'auto'}
          onChange={(v) => app.updateSettings({ balanceDecimals: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: '0', label: '0' },
            { value: '2', label: '2' },
            { value: '4', label: '4' },
            { value: '6', label: '6' },
          ]}
        />
        <Txt v="small" style={{ marginTop: -4, marginBottom: SP.sm }}>
          {t('Para el patrimonio y los saldos de las cuentas. Las transacciones siempre muestran el monto exacto.')}
        </Txt>
        <AppIconPicker />
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
          <View style={{ paddingVertical: SP.sm }}>
            <Txt v="body" style={{ marginBottom: 6 }}>
              {t('Bloqueo de la app')}
            </Txt>
            <Segmented<LockChoice>
              value={lockNow}
              onChange={chooseLock}
              options={[
                { value: 'off', label: 'Sin bloqueo' },
                { value: 'faceid', label: 'Face ID' },
                { value: 'pin', label: 'Código' },
              ]}
            />
            <Txt v="small" style={{ marginTop: -4 }}>
              {lockNow === 'pin'
                ? t('Código de 4 dígitos solo de Quorum. Si lo olvidas, entra con Face ID o el código del teléfono y crea uno nuevo.')
                : lockNow === 'faceid'
                  ? t('Al abrir Quorum y al volver a la app. Si Face ID falla dos veces, puedes usar el código del teléfono.')
                  : t('Cualquiera con tu teléfono desbloqueado puede ver tus cuentas (no mover fondos).')}
            </Txt>
            {lockNow === 'pin' && (
              <Button title="Cambiar código" kind="ghost" icon="key" onPress={() => setPinSheet({ mode: 'verify', then: () => setPinSheet({ mode: 'create', then: () => {} }) })} style={{ marginTop: SP.sm }} />
            )}
          </View>
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
                {lockNow === 'pin' ? t('Pedir el código al volver') : 'Pedir Face ID al volver'}
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

      {/* en Android el código no se guarda (Tangem lo pide cada vez): no hay nada que olvidar */}
      {tangemNativeLoaded && Platform.OS === 'ios' && (
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
      {pinSheet && (
        <PinSheet
          mode={pinSheet.mode}
          onCancel={() => setPinSheet(null)}
          onDone={() => {
            const next = pinSheet.then;
            setPinSheet(null);
            setTimeout(next, 350);
          }}
        />
      )}
    </Screen>
  );
}

export function ContactsScreen() {
  const app = useApp();
  const nav = useNav();
  const scanner = useAddressScanner();
  const [label, setLabel] = useState('');
  const [addr, setAddr] = useState('');
  const [tag, setTag] = useState('');
  // contacto que se está editando (el formulario de arriba sirve para agregar y para editar)
  const [editing, setEditing] = useState<string | null>(null);
  const clear = () => {
    setLabel('');
    setAddr('');
    setTag('');
    setEditing(null);
  };
  const menu = (c: (typeof app.contacts)[number]) =>
    Alert.alert(c.label, undefined, [
      {
        text: 'Editar',
        onPress: () => {
          setLabel(c.label);
          setAddr(c.address);
          setTag(c.tag ?? '');
          setEditing(c.id);
        },
      },
      {
        text: 'Quitar',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Quitar contacto', t('¿Quitar «{x}» de tus contactos?', { x: c.label }), [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Quitar',
              style: 'destructive',
              onPress: () => {
                if (editing === c.id) clear();
                app.removeContact(c.id);
              },
            },
          ]),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  return (
    <Screen title="Contactos" onBack={nav.pop} scrollKey={editing ?? ''}>
      <Card style={editing ? { borderColor: C.green } : undefined}>
        {editing ? (
          <Txt v="label" color={C.green} style={{ marginBottom: SP.sm }}>
            Editando contacto
          </Txt>
        ) : null}
        <Field label="Nombre" value={label} onChangeText={setLabel} placeholder="Exchange, socio…" />
        <Field
          label="Dirección"
          value={addr}
          onChangeText={setAddr}
          placeholder="r…"
          right={
            <>
              <Pressable
                style={{ padding: 6 }}
                onPress={() =>
                  scanner.open((a: string, t?: string) => {
                    setAddr(a);
                    if (t) setTag(t);
                  })
                }
              >
                <Feather name="maximize" size={18} color={C.green} />
              </Pressable>
              {scanner.modal}
            </>
          }
        />
        <Field label="Destination tag (opcional)" value={tag} onChangeText={setTag} keyboardType="number-pad" />
        <Button
          title={editing ? 'Guardar cambios' : 'Guardar contacto'}
          disabled={!label.trim() || !isValidClassicAddress(addr.trim()) || (!!tag.trim() && !/^\d{1,10}$/.test(tag.trim()))}
          onPress={() => {
            const save = async () => {
              await app.saveContact({ id: editing ?? newId(), label: label.trim(), address: addr.trim(), tag: tag.trim() || undefined });
              toast(editing ? 'Contacto actualizado' : 'Contacto guardado');
              clear();
            };
            // ¿se parece a una dirección de confianza sin serlo? (estafa de direcciones parecidas)
            const prev = editing ? app.contacts.find((c) => c.id === editing) : undefined;
            const twin = prev?.address === addr.trim() ? null : lookalikeOf(addr.trim(), trustedAddresses(app));
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
        {editing ? <Button title="Cancelar edición" kind="ghost" onPress={clear} /> : null}
      </Card>
      {app.contacts.map((c) => (
        <Card key={c.id} style={{ paddingVertical: 4 }}>
          <ListItem
            icon="user"
            title={c.label}
            subtitle={`${c.address.slice(0, 10)}…${c.address.slice(-6)}${c.tag ? ` · tag ${c.tag}` : ''}`}
            right={
              <Pressable hitSlop={10} onPress={() => menu(c)} accessibilityLabel={t('Opciones de {x}', { x: c.label })}>
                <Feather name="more-horizontal" size={20} color={C.dim} />
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
