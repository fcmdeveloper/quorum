/**
 * Verificar esta versión: la huella del código de esta app y lo que dice el registro público
 * de versiones en el XRP Ledger (cuenta Quorum Releases, firmada por el Consejo de validadores).
 * Es una ayuda: la prueba real es reconstruir el código uno mismo (VALIDATORS.md).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Clipboard from 'expo-clipboard';
import { lang, t } from '../i18n';
import { useNav } from '../nav';
import { Button, Card, Notice, Screen, Section, Txt, tap, toast } from '../ui/components';
import { C, R, SP } from '../ui/theme';
import { QUORUM } from '../config';
import { NETWORKS } from '../core/network';
import { appCodeHash } from '../ui/appHash';
import { fetchReleaseLog, ReleaseStatus, releaseStatus } from '../core/releases';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function Row({ icon, color, title, text }: { icon: React.ComponentProps<typeof Feather>['name']; color: string; title: string; text?: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 8 }}>
      <Feather name={icon} size={20} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Txt v="body">{title}</Txt>
        {text ? <Txt v="small">{text}</Txt> : null}
      </View>
    </View>
  );
}

export default function VerifyScreen() {
  const nav = useNav();
  const version = Constants.expoConfig?.version ?? '';
  const build = Constants.expoConfig?.ios?.buildNumber ?? '';
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<ReleaseStatus | null>(null);
  const [err, setErr] = useState(false);
  const [loading, setLoading] = useState(false);
  const registry = QUORUM.releasesAddress;

  useEffect(() => {
    appCodeHash().then(setHash);
  }, []);

  const load = useCallback(async () => {
    if (!registry || !hash) return;
    setLoading(true);
    setErr(false);
    try {
      setStatus(releaseStatus(await fetchReleaseLog('mainnet', registry), version, hash));
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, [registry, hash, version]);

  useEffect(() => {
    load();
  }, [load]);

  const copy = async () => {
    if (!hash) return;
    tap();
    await Clipboard.setStringAsync(`sha256:${hash}`);
    toast(t('Huella copiada'));
  };
  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const explorer = NETWORKS.mainnet.explorer;

  const ledger = () => {
    if (!hash) return null;
    if (!registry)
      return <Row icon="clock" color={C.dim} title={t('El registro aún no está activo')} text={t('Se activa con la primera versión publicada. Mientras tanto puedes reconstruir el código y comparar la huella.')} />;
    if (loading && !status) return <ActivityIndicator color={C.green} style={{ paddingVertical: SP.md }} />;
    if (err)
      return (
        <>
          <Row icon="wifi-off" color={C.warn} title={t('No se pudo leer el XRP Ledger')} />
          <Button title="Reintentar" kind="secondary" icon="refresh-cw" onPress={load} />
        </>
      );
    if (!status) return null;
    const { release, sameVersionOther, pass, fail, revoked } = status;
    return (
      <>
        {revoked && (
          <Row icon="alert-octagon" color={C.bad} title={t('Versión retirada')} text={revoked.reason ? t('El Consejo retiró esta versión: {x}. Actualiza la app.', { x: revoked.reason }) : t('El Consejo retiró esta versión. Actualiza la app.')} />
        )}
        {release ? (
          <Row
            icon="check-circle"
            color={C.green}
            title={t('Registrada en el XRP Ledger')}
            text={t('Versión {v} · commit {c}', { v: release.v, c: release.commit.slice(0, 7) }) + (release.date ? ` · ${release.date.slice(0, 10)}` : '')}
          />
        ) : sameVersionOther.length ? (
          <Row icon="alert-octagon" color={C.bad} title={t('Esta app no coincide con el registro')} text={t('La versión {v} está registrada con otra huella. No uses esta app y avísanos.', { v: version })} />
        ) : (
          <Row icon="help-circle" color={C.warn} title={t('Esta versión no está registrada')} text={t('Puede ser un build de prueba que aún no firma el Consejo. Las versiones de la App Store siempre están registradas.')} />
        )}
        {release && (
          <Row
            icon="users"
            color={release.signers.length >= 2 ? C.green : C.warn}
            title={release.signers.length === 1 ? t('Firmada por 1 miembro del Consejo') : t('Firmada por {n} miembros del Consejo', { n: release.signers.length })}
            text={release.signers.map(short).join(' · ') || undefined}
          />
        )}
        <Row
          icon="shield"
          color={pass.length ? C.green : C.dim}
          title={pass.length === 1 ? t('1 validador confirmó esta versión') : t('{n} validadores confirmaron esta versión', { n: pass.length })}
          text={pass.length ? pass.map((a) => short(a.account)).join(' · ') : undefined}
        />
        {fail.length > 0 && (
          <Row
            icon="alert-triangle"
            color={C.bad}
            title={fail.length === 1 ? t('1 validador reportó un problema') : t('{n} validadores reportaron un problema', { n: fail.length })}
            text={fail.map((a) => `${short(a.account)}${a.note ? `: ${a.note}` : ''}`).join('\n')}
          />
        )}
        {release && <Button title="Ver en el explorador" kind="ghost" icon="external-link" onPress={() => open(`${explorer}/transactions/${release.hash}`)} />}
      </>
    );
  };

  return (
    <Screen title="Verificar esta versión" onBack={nav.pop} onRefresh={load} refreshing={false}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.md }}>
        Comprueba que esta app ejecuta exactamente el código publicado en GitHub, revisado por validadores independientes.
      </Txt>

      <Section title="Esta app">
        <Card>
          <Txt v="small">{build ? t('Versión {v} (build {b})', { v: version, b: String(build) }) : t('Versión {v}', { v: version })}</Txt>
          {hash === undefined ? (
            <ActivityIndicator color={C.green} style={{ paddingVertical: SP.md }} />
          ) : hash === null ? (
            <Txt v="body" style={{ marginTop: 6 }}>
              Build de desarrollo: el código se carga desde el computador, así que no hay huella que verificar.
            </Txt>
          ) : (
            <>
              <Txt v="label" style={{ marginTop: SP.sm }}>
                Huella del código (SHA-256)
              </Txt>
              <Pressable onPress={copy} accessibilityLabel={t('Copiar huella')} style={({ pressed }) => ({ marginTop: 6, padding: SP.md, borderRadius: R.md, backgroundColor: C.surface2, opacity: pressed ? 0.7 : 1 })}>
                <Txt v="mono" color={C.text} style={{ lineHeight: 22 }}>
                  {hash.match(/.{1,16}/g)!.join(' ')}
                </Txt>
              </Pressable>
              <Txt v="small" style={{ marginTop: 6 }}>
                Toca la huella para copiarla.
              </Txt>
            </>
          )}
        </Card>
      </Section>

      {hash ? (
        <Section title="En el XRP Ledger">
          <Card>{ledger()}</Card>
        </Section>
      ) : null}

      <Section title="Verifícalo tú mismo">
        <Card>
          <Txt v="body">Descarga el código y reconstruye esta versión en tu computador (Mac o Linux):</Txt>
          <View style={{ marginTop: SP.sm, padding: SP.md, borderRadius: R.md, backgroundColor: C.surface2 }}>
            <Txt v="mono" color={C.text}>{`scripts/verify-release.sh v${version}`}</Txt>
          </View>
          <Txt v="small" style={{ marginTop: SP.sm }}>
            La línea “app code” debe ser idéntica a la huella de arriba. Si coincide, puedes registrar tu resultado en el XRP Ledger y sumarte como validador.
          </Txt>
          <Button title="Guía para validadores" icon="book-open" kind="secondary" style={{ marginTop: SP.md }} onPress={() => open(lang() === 'es' ? QUORUM.validatorsGuide.es : QUORUM.validatorsGuide.en)} />
          <Button title="Ver el registro en la web" icon="globe" kind="ghost" style={{ marginTop: SP.sm }} onPress={() => open(`${QUORUM.website}/verify/`)} />
        </Card>
      </Section>

      <Notice kind="info">
        Esta pantalla es una ayuda: una app modificada podría mostrar cualquier cosa. La prueba real es reconstruir el código tú mismo, o leer la huella del archivo descargado de la App Store (la guía explica cómo).
      </Notice>
    </Screen>
  );
}
