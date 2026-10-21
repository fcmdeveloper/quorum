/**
 * Registrar una versión en la cuenta Quorum Releases (solo aparece en esa bóveda).
 * Arma el AccountSet con el memo `quorum.release {…}` y lo deja como operación para que
 * firme el quórum del Consejo, igual que cualquier otra operación de la bóveda.
 */
import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import Constants from 'expo-constants';
import { t } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Button, Field, Notice, Screen, Segmented, Txt } from '../ui/components';
import { C, SP } from '../ui/theme';
import { proposalFailed } from '../ui/proposalError';
import { appCodeHash, thisPlatform } from '../ui/appHash';
import type { AppPlatform } from '../core/releases';
import { buildReleaseRecord } from '../core/tx';

export default function RegisterReleaseScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id);
  const [v, setV] = useState(Constants.expoConfig?.version ?? '');
  // cada plataforma se registra aparte, con su build y su huella
  const [platform, setPlatform] = useState<AppPlatform>(thisPlatform());
  const buildOf = (p: AppPlatform) => String((p === 'android' ? Constants.expoConfig?.android?.versionCode : Constants.expoConfig?.ios?.buildNumber) ?? '');
  const [build, setBuild] = useState(buildOf(thisPlatform()));
  const [commit, setCommit] = useState('');
  const [hash, setHash] = useState('');
  const [js, setJs] = useState('');
  const [busy, setBusy] = useState(false);

  // la huella de la app instalada como punto de partida (si es el build que se va a registrar);
  // solo sirve para la plataforma de este teléfono
  const [ownHash, setOwnHash] = useState<string | null>(null);
  useEffect(() => {
    appCodeHash().then((h) => {
      setOwnHash(h);
      if (h) setHash((cur) => cur || h);
    });
  }, []);
  const pickPlatform = (p: AppPlatform) => {
    setPlatform(p);
    setBuild(buildOf(p));
    setHash((cur) => (p === thisPlatform() ? cur || ownHash || '' : cur === ownHash ? '' : cur));
  };

  if (!a) return null;
  const prepare = async () => {
    let tx;
    try {
      tx = buildReleaseRecord(a.address, { v, build: build.trim() ? Number(build) : undefined, platform, commit, app: hash, js: js || undefined });
    } catch (e: any) {
      return Alert.alert('Revisa los datos', e.message);
    }
    setBusy(true);
    try {
      const p = await app.createProposal(a, tx, { note: t('Registrar versión {v} para {p}', { v: v.trim(), p: platform === 'android' ? 'Android' : 'iOS' }) });
      nav.replace('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Registrar una versión" onBack={nav.pop}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.lg }}>
        Copia los datos que muestra scripts/verify-release.sh para el tag de la versión. Queda como operación de la bóveda: se registra en el XRP Ledger solo cuando firma el quórum del Consejo.
      </Txt>
      <Txt v="label" style={{ marginBottom: 6 }}>
        Plataforma
      </Txt>
      <Segmented
        value={platform}
        onChange={pickPlatform}
        options={[
          { value: 'ios', label: 'iOS' },
          { value: 'android', label: 'Android' },
        ]}
      />
      <Field label="Versión" value={v} onChangeText={setV} placeholder="1.0.0" keyboardType="numbers-and-punctuation" />
      <Field label="Build" value={build} onChangeText={setBuild} placeholder="1" keyboardType="number-pad" />
      <Field label="Commit" value={commit} onChangeText={setCommit} placeholder="40 caracteres" hint="La línea “commit” del script." />
      <Field label="Huella del código" value={hash} onChangeText={setHash} placeholder="sha256:…" hint="La línea “app code”. Si este teléfono tiene instalado ese mismo build, ya viene completa." multiline style={{ minHeight: 64 }} />
      <Field label="Huella del JavaScript (opcional)" value={js} onChangeText={setJs} placeholder="sha256:…" hint="La línea “js source”." multiline style={{ minHeight: 64 }} />
      <Notice kind="warn">Revisa que la versión, el commit y la huella sean exactamente los publicados. Un registro firmado no se puede borrar: si hubo un error, se registra la versión corregida.</Notice>
      <View style={{ height: SP.md }} />
      <Button title="Preparar para firmar" icon="edit-3" busy={busy} onPress={prepare} />
    </Screen>
  );
}
