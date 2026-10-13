/**
 * Volver a leer el aviso de inicio (desde Acerca de y Ajustes) y el recordatorio mensual,
 * que pide confirmar lo esencial y revisa si la configuración está respaldada.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Button, Card, Logo, Screen, Txt, tap, toast } from '../ui/components';
import { C, SP } from '../ui/theme';
import { NeverAskCard, ResponsibilityList } from '../ui/legalBlocks';
import { REMINDER_POINTS } from '../legal';
import { BackupState, backupState, configFingerprint } from '../core/reminder';

function CheckRow({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onToggle();
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: SP.md }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          borderWidth: 2,
          borderColor: on ? C.green : C.lineStrong,
          backgroundColor: on ? C.green : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {on ? <Feather name="check" size={16} color={C.greenInk} /> : null}
      </View>
      <Txt v="body" style={{ flex: 1 }}>
        {label}
      </Txt>
    </Pressable>
  );
}

/** Estado del respaldo de la configuración actual. */
export function useBackupState(): BackupState {
  const app = useApp();
  return useMemo(
    () =>
      backupState(
        app.settings,
        {
          fingerprint: configFingerprint({ accounts: app.accounts, devices: app.devices, contacts: app.contacts }),
          empty: app.accounts.length === 0 && app.devices.length === 0 && app.contacts.length === 0,
        },
        Date.now(),
      ),
    [app.settings.backupAt, app.settings.backupHash, app.accounts, app.devices, app.contacts],
  );
}

/** Huella para guardar al exportar un respaldo. */
export function useConfigFingerprint(): () => string {
  const app = useApp();
  return () => configFingerprint({ accounts: app.accounts, devices: app.devices, contacts: app.contacts });
}

function backupText(b: BackupState): { title: string; text: string; ok: boolean } {
  switch (b.kind) {
    case 'never':
      return { ok: false, title: t('Aún no tienes un respaldo'), text: t('Si pierdes o cambias el teléfono, tendrías que volver a configurar todo a mano.') };
    case 'changed':
      return {
        ok: false,
        title: t('Tienes cambios sin respaldar'),
        text: b.days === 0 ? t('Cambiaste algo después de tu último respaldo de hoy.') : t('Tu último respaldo es de hace {n} días y desde entonces cambiaste algo.', { n: b.days }),
      };
    case 'old':
      return { ok: false, title: t('Tu respaldo tiene {n} días', { n: b.days }), text: t('Conviene renovarlo de vez en cuando.') };
    case 'ok':
      return { ok: true, title: t('Respaldo al día'), text: b.days === 0 ? t('Lo guardaste hoy.') : t('Lo guardaste hace {n} días.', { n: b.days }) };
    default:
      return { ok: true, title: '', text: '' };
  }
}

/** Tarjeta con el estado del respaldo y el botón para hacerlo. */
export function BackupStatusCard({ onBackup }: { onBackup: () => void }) {
  const b = useBackupState();
  if (b.kind === 'empty') return null;
  const x = backupText(b);
  const color = x.ok ? C.green : C.warn;
  return (
    <Card style={{ borderColor: color + '66' }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <Feather name={x.ok ? 'check-circle' : 'save'} size={20} color={color} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Txt v="h3">{x.title}</Txt>
          <Txt v="small">{x.text}</Txt>
        </View>
      </View>
      {!x.ok && <Button title="Hacer un respaldo ahora" icon="save" kind="secondary" onPress={onBackup} style={{ marginTop: SP.md }} />}
    </Card>
  );
}

/** Volver a leer el aviso de inicio completo (desde Acerca de o Ajustes). */
export function TermsReviewScreen() {
  const app = useApp();
  const nav = useNav();
  const [ok, setOk] = useState(false);
  return (
    <Screen title="Aviso de inicio" onBack={nav.pop}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.md }}>
        Lo mismo que aceptaste al empezar. Vale la pena repasarlo de vez en cuando.
      </Txt>
      <Card>
        <ResponsibilityList />
      </Card>
      <NeverAskCard />
      <CheckRow on={ok} onToggle={() => setOk((v) => !v)} label={t('Lo entiendo y lo tengo presente.')} />
      <Button
        title="Entendido"
        disabled={!ok}
        onPress={async () => {
          await app.updateSettings({ reviewedAt: Date.now() });
          toast(t('Gracias por repasarlo'));
          nav.pop();
        }}
      />
    </Screen>
  );
}

/** Recordatorio mensual: se muestra al abrir la app y hay que confirmarlo para seguir. */
export function ReminderScreen() {
  const app = useApp();
  const nav = useNav();
  const insets = useSafeAreaInsets();
  const [ok, setOk] = useState(false);
  const [full, setFull] = useState(false);
  const done = () => app.updateSettings({ reviewedAt: Date.now() });
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: SP.xl, paddingTop: insets.top + SP.xl, paddingBottom: insets.bottom + 40 }}>
        <Logo size={48} />
        <Txt v="h1" style={{ marginTop: SP.lg }}>
          Recordatorio de seguridad
        </Txt>
        <Txt v="body" color={C.dim} style={{ marginTop: 6, marginBottom: SP.lg }}>
          Una vez al mes te pedimos repasar lo esencial. Toma menos de un minuto.
        </Txt>
        <Card>
          {REMINDER_POINTS.map((p) => (
            <View key={p.text} style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
              <Feather name={p.icon} size={18} color={C.warn} style={{ marginTop: 2 }} />
              <Txt v="small" color={C.text} style={{ flex: 1 }}>
                {p.text}
              </Txt>
            </View>
          ))}
        </Card>
        <BackupStatusCard
          onBackup={async () => {
            await done();
            nav.push('backup', {});
          }}
        />
        <Pressable onPress={() => setFull((v) => !v)} hitSlop={8} style={{ paddingVertical: SP.sm }}>
          <Txt v="label" color={C.green}>
            {full ? t('Ocultar el aviso completo') : t('Leer el aviso completo')}
          </Txt>
        </Pressable>
        {full && (
          <>
            <Card>
              <ResponsibilityList />
            </Card>
            <NeverAskCard />
          </>
        )}
        <CheckRow on={ok} onToggle={() => setOk((v) => !v)} label={t('Lo entiendo y lo tengo presente.')} />
        <Button title="Entendido" disabled={!ok} onPress={done} />
      </ScrollView>
    </View>
  );
}
