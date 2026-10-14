/**
 * Insignias de validador (solo en la cuenta de la galería): lista las validaciones correctas
 * registradas en el XRP Ledger y permite acuñar y ofrecer la insignia de cada una.
 * Las cuentas y dispositivos de este teléfono (Minify) no reciben insignia.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { t } from '../i18n';
import { useApp } from '../state';
import { useNav } from '../nav';
import { Badge, Button, Card, Notice, Screen, Section, Txt } from '../ui/components';
import { C, SP } from '../ui/theme';
import { proposalFailed } from '../ui/proposalError';
import { QUORUM } from '../config';
import { fetchReleaseLog } from '../core/releases';
import { BadgeRow, badgeRows, badgeUri, buildBadgeMint, buildBadgeOffer, fetchGalleryBadgeState } from '../core/badges';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function BadgesScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const a = app.accounts.find((x) => x.id === id);
  const [rows, setRows] = useState<BadgeRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!a || !QUORUM.releasesAddress) return;
    setErr(null);
    try {
      const [log, st] = await Promise.all([fetchReleaseLog('mainnet', QUORUM.releasesAddress), fetchGalleryBadgeState('mainnet', a.address)]);
      const mine = new Set([...app.accounts.map((x) => x.address), ...app.devices.map((d) => d.address)]);
      setRows(badgeRows(log, st.mints, st.owned, st.offers, mine));
    } catch (e: any) {
      setErr(e?.message ?? String(e));
      setRows([]);
    }
  }, [a?.address, app.accounts.length, app.devices.length]);

  useEffect(() => {
    load();
  }, [load]);

  if (!a) return null;

  const run = async (key: string, build: () => any, note: string) => {
    setBusy(key);
    try {
      const p = await app.createProposal(a, build(), { note });
      nav.push('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setBusy(null);
    }
  };

  const group = (state: BadgeRow['state']) => (rows ?? []).filter((r) => r.state === state);
  const row = (r: BadgeRow) => {
    const key = `${r.release}:${r.to}`;
    return (
      <Card key={key}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SP.sm }}>
          <View style={{ flex: 1 }}>
            <Txt v="mono" color={C.text}>{short(r.to)}</Txt>
            <Txt v="small">{t('Validó la versión {v}', { v: r.release })}</Txt>
          </View>
          {r.state === 'offered' && <Badge text="Ofrecida" color={C.warn} icon="clock" />}
          {r.state === 'delivered' && <Badge text="Entregada" icon="check" />}
        </View>
        {r.state === 'todo' && (
          <Button
            title="Acuñar insignia"
            icon="award"
            busy={busy === key}
            style={{ marginTop: SP.md }}
            onPress={() => run(key, () => buildBadgeMint(a.address, r.release, r.to, badgeUri(QUORUM.website, r.release)), t('Insignia {v} para {a}', { v: r.release, a: short(r.to) }))}
          />
        )}
        {r.state === 'minted' && (
          <Button
            title="Ofrecer al validador"
            icon="gift"
            busy={busy === key}
            style={{ marginTop: SP.md }}
            onPress={() => run(key, () => buildBadgeOffer(a.address, r.nftId!, r.to), t('Regalar insignia {v} a {a}', { v: r.release, a: short(r.to) }))}
          />
        )}
      </Card>
    );
  };

  const sections: [BadgeRow['state'], string, string][] = [
    ['todo', 'Por acuñar', 'Validaciones correctas que aún no tienen insignia.'],
    ['minted', 'Acuñadas, falta ofrecerlas', 'La insignia existe en la galería; ahora hay que ofrecérsela al validador.'],
    ['offered', 'Esperando que la acepten', 'El validador debe aceptar la oferta desde su billetera.'],
    ['delivered', 'Entregadas', ''],
  ];

  return (
    <Screen title="Insignias de validador" onBack={nav.pop} onRefresh={load} refreshing={false}>
      <Txt v="body" color={C.dim} style={{ marginBottom: SP.md }}>
        Cada validación correcta en Quorum Releases recibe un NFT no transferible de la colección Quorum Validators. Primero se acuña y después se ofrece gratis solo a esa dirección.
      </Txt>
      {!QUORUM.releasesAddress ? (
        <Notice kind="info">El registro de versiones aún no está activo.</Notice>
      ) : rows === null ? (
        <ActivityIndicator color={C.green} style={{ paddingVertical: SP.xl }} />
      ) : (
        <>
          {err ? <Notice kind="warn">{t('No se pudo leer el XRP Ledger')}</Notice> : null}
          {rows.length === 0 && !err ? <Notice kind="info">Todavía no hay validaciones correctas de la comunidad.</Notice> : null}
          {sections.map(([state, title, hint]) =>
            group(state).length ? (
              <Section key={state} title={title}>
                {hint ? <Txt v="small" style={{ marginBottom: SP.sm }}>{hint}</Txt> : null}
                {group(state).map(row)}
              </Section>
            ) : null,
          )}
        </>
      )}
      <Notice kind="info">Las cuentas y dispositivos de este teléfono no reciben insignia: Minify no se entrega insignias a sí mismo.</Notice>
    </Screen>
  );
}
