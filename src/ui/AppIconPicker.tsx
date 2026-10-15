/**
 * Ícono de la app: Dark (el de siempre), Light o uno de Quorum Gallery. Los íconos vienen dentro
 * de la app (iOS y Android solo permiten íconos incluidos en la instalación); se agregan en
 * app.json (plugin expo-alternate-app-icons) y requieren `expo prebuild`.
 */
import React, { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAppIconName, setAlternateAppIcon, supportsAlternateIcons } from 'expo-alternate-app-icons';
import { t } from '../i18n';
import { Card, Txt, tap, toast } from './components';
import { C, SP } from './theme';

/** name: el de app.json (null = ícono principal). 15 en total: 3 filas de 5. */
const ICONS: { name: string | null; label: string; src: any }[] = [
  { name: null, label: 'Dark', src: require('../../assets/icons/thumb-original.png') },
  { name: 'Light', label: 'Light', src: require('../../assets/icons/thumb-light.png') },
  { name: 'Gallery', label: 'Gallery', src: require('../../assets/icons/thumb-gallery.png') },
  { name: 'Ember', label: 'Ember', src: require('../../assets/icons/thumb-ember.png') },
  { name: 'Ocean', label: 'Ocean', src: require('../../assets/icons/thumb-ocean.png') },
  { name: 'Violet', label: 'Violet', src: require('../../assets/icons/thumb-violet.png') },
  { name: 'Solar', label: 'Solar', src: require('../../assets/icons/thumb-solar.png') },
  { name: 'Rose', label: 'Rose', src: require('../../assets/icons/thumb-rose.png') },
  { name: 'Ice', label: 'Ice', src: require('../../assets/icons/thumb-ice.png') },
  { name: 'XrpMidnight', label: 'Midnight', src: require('../../assets/icons/thumb-xrp-midnight.png') },
  { name: 'XrpAurora', label: 'Aurora', src: require('../../assets/icons/thumb-xrp-aurora.png') },
  { name: 'XrpSunset', label: 'Sunset', src: require('../../assets/icons/thumb-xrp-sunset.png') },
  { name: 'XrpGold', label: 'Gold', src: require('../../assets/icons/thumb-xrp-gold.png') },
  { name: 'XrpElectric', label: 'Electric', src: require('../../assets/icons/thumb-xrp-electric.png') },
  { name: 'XrpCrimson', label: 'Crimson', src: require('../../assets/icons/thumb-xrp-crimson.png') },
];

const SIZE = 54;
const GAP = 12;
const COLS = 5;

function current(): string | null {
  try {
    return getAppIconName();
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isBusyError = (e: any) => /temporarily|code[ =]35|EAGAIN/i.test(String(e?.message ?? e));

/** iOS a veces responde "Resource temporarily unavailable" si se le pide justo después de otra acción: se reintenta. */
async function setIconWithRetry(name: string | null) {
  const waits = [0, 600, 1500];
  let last: unknown;
  for (const w of waits) {
    if (w) await sleep(w);
    try {
      await setAlternateAppIcon(name);
      return;
    } catch (e) {
      last = e;
      if (!isBusyError(e)) throw e;
    }
  }
  throw last;
}

export function AppIconPicker() {
  const [sel, setSel] = useState<string | null>(current);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!supportsAlternateIcons) return null;
  const cur = ICONS.find((i) => i.name === sel) ?? ICONS[0];

  const pick = async (name: string | null) => {
    if (busy || name === sel) return;
    tap();
    setBusy(true);
    try {
      await setIconWithRetry(name);
      setSel(name);
    } catch (e: any) {
      if (isBusyError(e)) {
        // Error conocido de iOS 26+ (NSPOSIXErrorDomain 35): el sistema de íconos queda ocupado y
        // a veces solo se libera reiniciando el teléfono. No es un problema de la app.
        toast(t('iOS no pudo cambiar el ícono ahora. Intenta de nuevo en un momento; si sigue, reinicia el teléfono.'), 'warn');
      } else {
        // Si el ícono no está dentro de la app (falta `expo prebuild` tras agregarlo), iOS lo rechaza.
        toast(`${t('No se pudo cambiar el ícono')}${e?.message ? `: ${String(e.message).slice(0, 80)}` : ''}`, 'warn');
      }
      setSel(current());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ paddingVertical: 4 }}>
      {/* Cerrado: solo el ícono actual. Al tocar se despliegan todos. */}
      <Pressable
        onPress={() => {
          tap();
          setOpen((v) => !v);
        }}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: 10, opacity: pressed ? 0.7 : 1 })}
      >
        <Image source={cur.src} style={{ width: 40, height: 40, borderRadius: 10 }} />
        <View style={{ flex: 1 }}>
          <Txt v="body">{t('Cambiar ícono de la app')}</Txt>
          <Txt v="small">{cur.label}</Txt>
        </View>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={C.dim} />
      </Pressable>
      {open && (
        <View style={{ paddingBottom: SP.md }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: GAP, columnGap: GAP, width: SIZE * COLS + GAP * (COLS - 1), alignSelf: 'center', marginTop: SP.sm }}>
            {ICONS.map((ic) => {
              const on = ic.name === sel;
              return (
                <Pressable
                  key={ic.label}
                  onPress={() => pick(ic.name)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t('Ícono {x}', { x: ic.label })}
                  style={({ pressed }) => ({ width: SIZE, alignItems: 'center', gap: 4, opacity: pressed || busy ? 0.6 : 1 })}
                >
                  <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE * 0.26, borderWidth: 2, borderColor: on ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={ic.src} resizeMode="cover" style={{ width: SIZE - 8, height: SIZE - 8, borderRadius: (SIZE - 8) * 0.23 }} />
                    {on && (
                      <View style={{ position: 'absolute', right: -4, bottom: -4, width: 20, height: 20, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name="check" size={13} color="#00140A" />
                      </View>
                    )}
                  </View>
                  <Txt v="small" numberOfLines={1} style={{ fontSize: 11, width: SIZE + GAP, textAlign: 'center' }}>
                    {ic.label}
                  </Txt>
                </Pressable>
              );
            })}
          </View>
          <Txt v="small" style={{ marginTop: SP.md }}>
            {t('Arte de Quorum Gallery. Al cambiarlo, el teléfono muestra un aviso del sistema.')}
          </Txt>
        </View>
      )}
    </Card>
  );
}
