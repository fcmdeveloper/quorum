import React, { useEffect, useState } from 'react';
import { t, tr } from '../i18n';
import { QUORUM } from '../config';
import { Feather } from '@expo/vector-icons';
import { Alert, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useApp } from '../state';
import { useNav } from '../nav';
import { proposalFailed } from '../ui/proposalError';
import { useMoney } from '../ui/money';
import { Action, Address, Badge, Card, IconButton, ListItem, QuorumRing, Screen, Section, Txt, Button, AccountAvatar, ColorPicker, IconPicker, XrpMark, accountIcon } from '../ui/components';
import { C, F, SP } from '../ui/theme';
import { minSigners, lossTolerance, vaultHealth } from '../core/health';
import { ActivityItem, NETWORKS, fetchActivity, fundTestnet } from '../core/network';
import { KIND_LABEL } from '../signers/types';
import { KNOWN_TOKENS } from '../core/assets';
import { buildRemoveTrust, buildTrustSet, TxJson } from '../core/tx';
import { XrpLoader } from '../ui/XrpLoader';
import { buildPinNft, canPin } from '../core/pin';
import { isPreparing } from '../core/seedVault';
import { ActivityRow } from './ActivityScreen';

export default function AccountScreen({ id }: { id: string }) {
  const app = useApp();
  const nav = useNav();
  const m = useMoney();
  const a = app.accounts.find((x) => x.id === id);
  const [acts, setActs] = useState<ActivityItem[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(a?.label ?? '');
  const [picking, setPicking] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  // Token que se está habilitando o quitando: mientras, no se aceptan más toques.
  const [tokenBusy, setTokenBusy] = useState<string | null>(null);

  const load = async () => {
    if (!a) return;
    await app.refreshAccount(a);
    try {
      setActs(await fetchActivity(a.network, a.address, 8));
    } catch {
      setActs([]);
    }
  };
  useEffect(() => {
    load();
  }, [id]);

  if (!a) {
    return (
      <Screen title="Cuenta" onBack={nav.pop}>
        <Txt v="body">Esta cuenta ya no existe.</Txt>
      </Screen>
    );
  }
  const st = app.stateOf(a);
  const isVault = a.kind === 'vault';
  const dev = app.deviceFor(a.address);
  const h = vaultHealth(st);
  const list = st?.signerList;
  const pend = app.proposals.filter((p) => p.account === a.address && p.network === a.network && (p.status === 'collecting' || p.status === 'ready'));
  // Bóveda creada en Quorum sin terminar: solo se permiten los pasos de configuración.
  const preparing = isPreparing(a, st);
  const canSign = preparing ? false : isVault ? !!list || (!!dev && !st?.masterDisabled) : !!dev;

  const tokenTx = async (key: string, tx: TxJson) => {
    if (tokenBusy) return;
    setTokenBusy(key);
    try {
      const p = await app.createProposal(a, tx);
      nav.push('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo', e, nav);
    } finally {
      setTokenBusy(null);
    }
  };
  const removeToken = (key: string, sym: string, token: { currency: string; issuer: string }) =>
    Alert.alert(t('Quitar {x}', { x: sym }), t('Se borra la línea de confianza y se libera la reserva de 0,2 XRP. Puedes volver a habilitarlo cuando quieras.'), [
      { text: t('Cancelar'), style: 'cancel' },
      {
        text: t('Quitar'),
        style: 'destructive',
        onPress: () => tokenTx(key, buildRemoveTrust(a.address, token)),
      },
    ]);
  // Saldo del token y, si está en 0 y se puede firmar, la opción de quitarlo.
  const tokenRight = (key: string, sym: string, token: { currency: string; issuer: string }, balance: string) => (
    <View style={{ alignItems: 'flex-end' }}>
      <Txt v="h3">{m.balXrp(balance)}</Txt>
      {canSign && Number(balance) === 0 ? (
        tokenBusy === key ? (
          <XrpLoader size={20} delay={0} />
        ) : (
          <Pressable hitSlop={8} disabled={!!tokenBusy} onPress={() => removeToken(key, sym, token)}>
            <Txt v="label" color={C.dim}>
              Quitar
            </Txt>
          </Pressable>
        )
      ) : null}
    </View>
  );

  // NFT fijado en el XRP Ledger (core/pin.ts): visible para cualquiera con Quorum.
  const pinnedId = st?.walletLocator ?? null;
  const pinnedHere = !!a.nft && pinnedId === a.nft.id.toUpperCase();
  const pinTx = async (nftId: string | null) => {
    setPinBusy(true);
    try {
      const p = await app.createProposal(a, buildPinNft(a.address, nftId));
      nav.push('proposal', { id: p.id });
    } catch (e: any) {
      proposalFailed('No se pudo preparar', e, nav);
    } finally {
      setPinBusy(false);
    }
  };
  const pin = async () => {
    if (!a.nft) return;
    setPinBusy(true);
    let ok = false;
    try {
      ok = await canPin(a.network, a.address, a.nft.id, QUORUM.nftGalleryAddress || undefined);
    } catch {
      setPinBusy(false);
      return Alert.alert(t('No se pudo leer el XRP Ledger'), t('Revisa la conexión e inténtalo de nuevo.'));
    }
    setPinBusy(false);
    if (!ok) return Alert.alert(t('No se puede fijar'), t('Para fijarlo, el NFT tiene que estar en esta cuenta o ser de Quorum Gallery.'));
    Alert.alert(
      t('Fijar en el XRP Ledger'),
      t('La imagen quedará guardada en la cuenta: cualquiera con Quorum la verá, en cualquier teléfono. Es pública y queda en el historial de la cuenta. Solo cuesta la comisión de la red.'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        { text: t('Fijar'), onPress: () => pinTx(a.nft!.id.toUpperCase()) },
      ],
    );
  };
  const unpin = () =>
    Alert.alert(t('Quitar del XRP Ledger'), t('La cuenta dejará de mostrar esta imagen en otros teléfonos. El cambio queda en el historial.'), [
      { text: t('Cancelar'), style: 'cancel' },
      { text: t('Quitar'), style: 'destructive', onPress: () => pinTx(null) },
    ]);

  const menu = () =>
    Alert.alert(a.label, undefined, [
      { text: 'Cambiar nombre', onPress: () => setEditing(true) },
      { text: 'Cambiar color e ícono', onPress: () => setPicking(true) },
      {
        text: 'Ver en el explorador',
        onPress: () => Linking.openURL(`${NETWORKS[a.network].explorer}/accounts/${a.address}`),
      },
      {
        text: 'Quitar de Quorum',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Quitar cuenta', 'Solo se quita de esta app. La cuenta y sus fondos siguen en el XRP Ledger.', [
            { text: 'Cancelar', style: 'cancel' },
            {
              text: 'Quitar',
              style: 'destructive',
              onPress: async () => {
                await app.removeAccount(a.id);
                nav.pop();
              },
            },
          ]),
      },
      { text: 'Cancelar', style: 'cancel' },
    ]);

  return (
    <Screen
      title={isVault ? 'Bóveda' : 'Cuenta'}
      onBack={nav.pop}
      right={<IconButton icon="more-horizontal" label="Opciones" onPress={menu} />}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    >
      <View style={{ alignItems: 'center', paddingVertical: SP.md }}>
        <Pressable onPress={() => setPicking((v) => !v)} accessibilityLabel={t('Cambiar color e ícono')} style={{ marginBottom: SP.md }}>
          <AccountAvatar color={a.color} size={isVault && a.nft ? 72 : 56} icon={accountIcon(a, dev)} nft={a.nft?.image} round={isVault} />
        </Pressable>
        {picking && (
          <View style={{ marginBottom: SP.lg, gap: SP.md, alignItems: 'center' }}>
            <Txt v="label">Color</Txt>
            <ColorPicker value={a.color} onChange={(c) => app.updateAccount(a.id, { color: c })} />
            <Txt v="label" style={{ marginTop: SP.sm }}>
              Ícono
            </Txt>
            <IconPicker value={a.nft ? undefined : a.icon} color={a.color} onChange={(ic) => app.updateAccount(a.id, { icon: ic, nft: undefined })} />
            <Txt v="label" style={{ marginTop: SP.sm }}>
              NFT
            </Txt>
            <Pressable
              onPress={() => nav.push('pickNft', { id: a.id })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: SP.lg,
                height: 40,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: a.nft ? C.green : C.lineStrong,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <Feather name="image" size={16} color={a.nft ? C.green : C.dim} />
              <Txt v="label" color={a.nft ? C.green : C.text}>
                {a.nft ? t('Cambiar NFT') : t('Elegir un NFT')}
              </Txt>
            </Pressable>
            {canSign && st?.exists && (a.nft || pinnedId) ? (
              <View
                style={{
                  alignItems: 'center',
                  gap: 6,
                  marginTop: SP.xs,
                  paddingHorizontal: SP.lg,
                }}
              >
                {pinnedHere ? (
                  <Txt v="small" color={C.green} style={{ textAlign: 'center' }}>
                    {t('Fijado en el XRP Ledger: se ve igual en cualquier teléfono')}
                  </Txt>
                ) : a.nft && !a.nft.pinned ? (
                  <Button title={t('Fijar en el XRP Ledger')} kind="secondary" icon="anchor" busy={pinBusy} onPress={pin} />
                ) : null}
                {pinnedId ? (
                  <Pressable onPress={unpin} hitSlop={10} disabled={pinBusy}>
                    <Txt v="label" color={C.dim}>
                      {t('Quitar del XRP Ledger')}
                    </Txt>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: SP.xl, marginTop: SP.sm }}>
              {a.icon || a.color || a.nft ? (
                <Pressable
                  onPress={() =>
                    app.updateAccount(a.id, {
                      icon: undefined,
                      color: undefined,
                      nft: undefined,
                    })
                  }
                  hitSlop={10}
                >
                  <Txt v="label" color={C.dim}>
                    Volver al original
                  </Txt>
                </Pressable>
              ) : null}
              <Pressable onPress={() => setPicking(false)} hitSlop={10}>
                <Txt v="label" color={C.green}>
                  Listo
                </Txt>
              </Pressable>
            </View>
          </View>
        )}
        {editing ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              autoFocus
              style={{
                fontFamily: F.semibold,
                fontSize: 18,
                color: C.text,
                borderBottomWidth: 1,
                borderColor: C.green,
                minWidth: 160,
                paddingVertical: 4,
              }}
              onSubmitEditing={async () => {
                if (name.trim()) await app.updateAccount(a.id, { label: name.trim() });
                setEditing(false);
              }}
            />
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <Txt v="h2">{a.label}</Txt>
            {a.network === 'testnet' && <Badge text="Testnet" color={C.test} />}
          </View>
        )}
        <View style={{ marginTop: 6 }}>
          <Address value={a.address} short />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            marginTop: SP.lg,
          }}
        >
          <XrpMark size={30} color={C.text} />
          <Text
            style={{
              fontFamily: F.bold,
              fontSize: 42,
              color: C.text,
              letterSpacing: -1.4,
            }}
          >
            {st ? m.balXrp(st.balanceXrp) : '…'}
          </Text>
        </View>
        <Txt v="body" color={C.dim}>
          {st ? m.balFiatOf(st.balanceXrp, a.network) : ''}
        </Txt>
        {st?.exists ? (
          <Txt v="small" style={{ marginTop: 4 }}>
            Disponible {m.balXrp(st.spendableXrp)} · Reserva {st.reserveXrp}
          </Txt>
        ) : st ? (
          <Txt v="small" color={C.warn} style={{ marginTop: 6, textAlign: 'center' }}>
            Cuenta sin activar: envíale al menos 1 XRP de reserva para que exista en la red.
          </Txt>
        ) : app.errors[`${a.network}:${a.address}`] ? (
          <Txt v="small" color={C.bad}>
            {app.errors[`${a.network}:${a.address}`]}
          </Txt>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', marginTop: SP.lg, marginBottom: SP.md }}>
        <Action icon="arrow-up-right" label="Enviar" disabled={!canSign || !st?.exists} onPress={() => nav.push('send', { id: a.id })} />
        <Action icon="arrow-down-left" label="Recibir" onPress={() => nav.push('receive', { id: a.id })} />
        <Action icon="repeat" label="Swap" disabled={!canSign || !st?.exists} onPress={() => nav.push('swap', { id: a.id })} />
        <Action icon="bar-chart-2" label="DEX" disabled={!st?.exists || preparing} onPress={() => nav.push('trade', { id: a.id })} />
      </View>

      {preparing && (
        <Card style={{ borderColor: C.warn + '88' }}>
          <Txt v="h3">Bóveda en preparación</Txt>
          <Txt v="small" style={{ marginVertical: 6 }}>
            {!st?.exists
              ? 'Envíale solo lo mínimo para activarla y sigue con la configuración.'
              : list
                ? 'Falta probar la multifirma y desactivar la master key. Hasta entonces, mantén solo lo mínimo en esta cuenta.'
                : 'Falta elegir los firmantes. Mantén solo lo mínimo en esta cuenta hasta terminar.'}
          </Txt>
          <Button title="Continuar configuración" icon="arrow-right" onPress={() => nav.push(list ? 'finishVault' : 'vaultWizard', { id: a.id })} />
        </Card>
      )}

      {a.network === 'testnet' && st && Number(st.balanceXrp) < 20 && (
        <Button
          title="Recibir XRP de prueba"
          kind="secondary"
          icon="droplet"
          onPress={async () => {
            try {
              await fundTestnet(a.address);
              setTimeout(load, 5000);
              Alert.alert('Faucet', 'Enviamos XRP de prueba. Se verán en unos segundos.');
            } catch (e: any) {
              Alert.alert('Faucet', e.message);
            }
          }}
        />
      )}

      {isVault && (
        <Card onPress={() => nav.push('security', { id: a.id })} style={{ marginTop: SP.lg }}>
          <View style={{ flexDirection: 'row', gap: SP.lg, alignItems: 'center' }}>
            <QuorumRing
              size={84}
              segments={list ? list.entries.map((e) => ({ weight: e.weight, on: true })) : [{ weight: 1, on: false }]}
              center={list ? `${minSigners(list)}/${list.entries.length}` : '—'}
              sub={list ? 'firmas' : undefined}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt v="h3">{h.summary}</Txt>
              <Txt v="small">
                {list
                  ? t('Se necesitan {n} dispositivos · tolera perder {m}', {
                      n: minSigners(list),
                      m: lossTolerance(list),
                    })
                  : 'Aún no tiene firmantes. Configúrala para protegerla.'}
              </Txt>
              <Txt v="label" color={C.green}>
                Ver seguridad
              </Txt>
            </View>
          </View>
          {list && (
            <View
              style={{
                marginTop: SP.md,
                borderTopWidth: 1,
                borderColor: C.line,
                paddingTop: SP.sm,
              }}
            >
              {list.entries.map((e) => {
                const d = app.deviceFor(e.account);
                return (
                  <ListItem
                    key={e.account}
                    icon={d?.kind === 'ledger' ? 'cpu' : d?.kind === 'tangem' ? 'credit-card' : d ? 'smartphone' : 'help-circle'}
                    iconColor={d ? C.green : C.faint}
                    title={d ? d.label : 'Dispositivo de otro teléfono'}
                    subtitle={`${d ? KIND_LABEL[d.kind] + ' · ' : ''}${e.account.slice(0, 6)}…${e.account.slice(-4)}`}
                    right={<Badge text={t('peso {n}', { n: e.weight })} color={C.dim} />}
                  />
                );
              })}
            </View>
          )}
        </Card>
      )}

      {isVault && list && !list.entries.some((e) => app.deviceFor(e.account)) && (
        <Card style={{ marginTop: SP.lg }}>
          <ListItem
            icon="share-2"
            title="Firmas en otros teléfonos"
            subtitle="Ninguno de sus firmantes está en este teléfono. Puedes proponer operaciones y compartirlas por QR para que las firmen; los fondos solo se mueven cuando firma el quórum."
          />
        </Card>
      )}

      {!isVault && (
        <Card style={{ marginTop: SP.lg }}>
          <ListItem
            icon={dev ? (dev.kind === 'ledger' ? 'cpu' : dev.kind === 'tangem' ? 'credit-card' : 'smartphone') : 'eye'}
            title={dev ? t('Firma con {x}', { x: dev.label }) : 'Solo lectura'}
            subtitle={dev ? KIND_LABEL[dev.kind] : 'Registra el dispositivo de esta cuenta para poder enviar'}
          />
        </Card>
      )}

      {pend.length > 0 && (
        <Section title="Por firmar">
          {pend.map((p) => (
            <Card key={p.id} onPress={() => nav.push('proposal', { id: p.id })}>
              <ListItem
                icon="edit-3"
                iconColor={C.warn}
                title={p.tx.TransactionType === 'Payment' ? 'Envío' : p.tx.TransactionType}
                subtitle={p.status === 'ready' ? 'Lista para enviar' : p.signatures.length === 1 ? t('1 firma') : t('{n} firmas', { n: p.signatures.length })}
              />
            </Card>
          ))}
        </Section>
      )}

      {st?.exists && (
        <Section title="Activos">
          <Card style={{ paddingVertical: 4 }}>
            <ListItem glyph={<XrpMark size={17} color={C.green} />} title="XRP" subtitle={m.balFiatOf(st.balanceXrp, a.network)} right={<Txt v="h3">{m.balXrp(st.balanceXrp)}</Txt>} />
            {KNOWN_TOKENS[a.network].map((k) => {
              const line = st.tokens.find((t) => t.currency === k.currency && t.issuer === k.issuer);
              if (line) {
                return (
                  <ListItem
                    key={k.symbol}
                    icon="dollar-sign"
                    iconColor={k.color}
                    title={k.symbol}
                    subtitle={m.tokenFiat(Number(line.balance), { currency: k.currency, issuer: k.issuer }, a.network) || k.name}
                    right={tokenRight(k.symbol, k.symbol, { currency: k.currency, issuer: k.issuer }, line.balance)}
                  />
                );
              }
              return (
                <ListItem
                  key={k.symbol}
                  icon="dollar-sign"
                  iconColor={C.faint}
                  title={k.symbol}
                  subtitle={t('{x} · no habilitado', { x: k.name })}
                  right={
                    canSign ? (
                      tokenBusy === k.symbol ? (
                        <XrpLoader size={20} delay={0} />
                      ) : (
                        <Pressable
                          hitSlop={8}
                          disabled={!!tokenBusy}
                          onPress={() =>
                            tokenTx(
                              k.symbol,
                              buildTrustSet(a.address, {
                                currency: k.currency,
                                issuer: k.issuer,
                              }),
                            )
                          }
                        >
                          <Txt v="label" color={C.green}>
                            Habilitar
                          </Txt>
                        </Pressable>
                      )
                    ) : undefined
                  }
                />
              );
            })}
            {st.tokens
              .filter((t) => !KNOWN_TOKENS[a.network].some((k) => k.currency === t.currency && k.issuer === t.issuer))
              .map((t) => (
                <ListItem
                  key={t.currency + t.issuer}
                  icon="disc"
                  iconColor={C.dim}
                  title={t.label}
                  subtitle={`${tr('No verificado')} · ${t.issuer.slice(0, 6)}…${t.issuer.slice(-4)}`}
                  right={tokenRight(t.currency + t.issuer, t.label, { currency: t.currency, issuer: t.issuer }, t.balance)}
                />
              ))}
          </Card>
          <Txt v="small">Habilitar un token reserva 0,2 XRP de la cuenta mientras la línea exista. Con saldo 0 puedes quitarlo y recuperar esa reserva.</Txt>
        </Section>
      )}

      <Card style={{ marginTop: SP.lg, paddingVertical: 4 }}>
        <ListItem icon="image" title="NFTs" onPress={() => nav.push('nfts', { id: a.id })} />
        {isVault && <ListItem icon="shield" title="Seguridad de la bóveda" onPress={() => nav.push('security', { id: a.id })} />}
        {a.network === 'mainnet' && !!QUORUM.nftGalleryAddress && a.address === QUORUM.nftGalleryAddress && (
          <ListItem icon="award" title="Insignias de validador" subtitle="Entregar los NFT Quorum Validator" onPress={() => nav.push('badges', { id: a.id })} />
        )}
        {isVault && a.network === 'mainnet' && !!QUORUM.releasesAddress && a.address === QUORUM.releasesAddress && (
          <ListItem icon="check-circle" title="Registrar una versión" subtitle="Registro público de Quorum Releases" onPress={() => nav.push('registerRelease', { id: a.id })} />
        )}
        {!isVault && app.deviceFor(a.address)?.kind === 'xaman' && (
          <ListItem
            icon="lock"
            title="Convertir en bóveda"
            subtitle="No disponible para cuentas Xaman"
            onPress={() =>
              Alert.alert(
                'Convertir en bóveda',
                'Xaman no permite que otras apps configuren la multifirma de sus cuentas, así que esta cuenta no se puede convertir desde Quorum. Crea una bóveda nueva (Nueva bóveda → Cuenta nueva) y mueve los fondos a ella cuando esté lista. Tu Xaman puede ser uno de sus firmantes.',
              )
            }
          />
        )}
        {!isVault && app.deviceFor(a.address) && app.deviceFor(a.address)!.kind !== 'xaman' && (
          <ListItem
            icon="lock"
            title="Convertir en bóveda"
            subtitle="Misma dirección y fondos, protegida con multifirma"
            onPress={() =>
              Alert.alert(
                'Convertir en bóveda',
                t('“{a}” pasará a ser una bóveda: eliges los firmantes y el quórum, y al final se puede desactivar la clave de {d}. Hazlo primero en testnet.', {
                  a: a.label,
                  d: app.deviceFor(a.address)!.label,
                }),
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Continuar',
                    onPress: async () => {
                      await app.updateAccount(a.id, { kind: 'vault' });
                      nav.push('vaultWizard', { id: a.id });
                    },
                  },
                ],
              )
            }
          />
        )}
        <ListItem icon="external-link" title="Ver en el explorador" onPress={() => Linking.openURL(`${NETWORKS[a.network].explorer}/accounts/${a.address}`)} />
      </Card>

      <Section title="Actividad">
        <Card style={{ paddingVertical: 4 }}>
          {acts === null ? (
            <Txt v="small" style={{ padding: SP.md }}>
              Cargando…
            </Txt>
          ) : acts.length === 0 ? (
            <Txt v="small" style={{ padding: SP.md }}>
              Sin movimientos todavía.
            </Txt>
          ) : (
            acts.map((it) => <ActivityRow key={it.hash} it={it} network={a.network} />)
          )}
        </Card>
      </Section>
    </Screen>
  );
}
