import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextProps,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import { t, tr } from '../i18n';
import { C, F, R, SP, T, ACCOUNT_COLORS, accountColor, alpha, onThemeChange } from './theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

/** Interruptor global de vibraciones (Ajustes → Vibraciones). */
let hapticsOn = true;
export function setHapticsEnabled(v: boolean) {
  hapticsOn = v;
}
export function hapticsEnabled() {
  return hapticsOn;
}

export function tap() {
  if (hapticsOn) Haptics.selectionAsync().catch(() => {});
}
export function success() {
  if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
export function warnBuzz() {
  if (hapticsOn) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

// ───────────── Texto ─────────────

type V = keyof typeof T;
export function Txt({ v = 'body', color, style, children, ...rest }: TextProps & { v?: V; color?: string }) {
  return (
    <Text {...rest} style={[T[v], color ? { color } : null, style]}>
      {tr(children)}
    </Text>
  );
}

// ───────────── Toast ─────────────

type ToastMsg = { text: string; kind: 'ok' | 'warn' | 'bad' };
let pushToast: ((m: ToastMsg) => void) | null = null;
export function toast(text: string, kind: ToastMsg['kind'] = 'ok') {
  pushToast?.({ text: t(text), kind });
}

export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const y = useRef(new Animated.Value(-120)).current;
  const insets = useSafeAreaInsets();
  useEffect(() => {
    pushToast = (m) => {
      setMsg(m);
      Animated.sequence([
        Animated.spring(y, { toValue: 0, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(y, { toValue: -120, duration: 220, useNativeDriver: true }),
      ]).start();
    };
    return () => {
      pushToast = null;
    };
  }, []);
  if (!msg) return null;
  const color = msg.kind === 'ok' ? C.green : msg.kind === 'warn' ? C.warn : C.bad;
  return (
    <Animated.View
      pointerEvents="none"
      style={[st.toast, { top: insets.top + 8, transform: [{ translateY: y }], borderColor: color }]}
    >
      <Feather name={msg.kind === 'ok' ? 'check-circle' : 'alert-triangle'} size={16} color={color} />
      <Txt v="body" style={{ flex: 1 }}>
        {msg.text}
      </Txt>
    </Animated.View>
  );
}

// ───────────── Estructura ─────────────

export function Screen({
  title,
  onBack,
  right,
  children,
  refreshing,
  onRefresh,
  scroll = true,
  padded = true,
  top,
}: {
  /** Encabezado propio fijo (reemplaza al título); el indicador de recarga aparece debajo. */
  top?: React.ReactNode;
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  padded?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const header = top ? (
    <View style={{ paddingTop: insets.top + 6, paddingHorizontal: SP.lg, paddingBottom: SP.sm, backgroundColor: C.bg }}>{top}</View>
  ) : title || onBack || right ? (
      <View style={[st.header, { paddingTop: insets.top + 6 }]}>
        <View style={{ width: 44 }}>
          {onBack ? (
            <Pressable onPress={onBack} hitSlop={12} style={st.iconBtn} accessibilityLabel={t('Volver')}>
              <Feather name="chevron-left" size={24} color={C.text} />
            </Pressable>
          ) : null}
        </View>
        <Txt v="h3" numberOfLines={1} style={{ flex: 1, textAlign: 'center' }}>
          {title ?? ''}
        </Txt>
        <View style={{ width: 44, alignItems: 'flex-end' }}>{right}</View>
      </View>
    ) : (
      <View style={{ height: insets.top }} />
    );
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {header}
      {scroll ? (
        <ScrollView
          contentContainerStyle={{ padding: padded ? SP.lg : 0, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          refreshControl={
            onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.green} /> : undefined
          }
        >
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: padded ? SP.lg : 0 }}>{children}</View>
      )}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: ViewStyle; onPress?: () => void }) {
  if (onPress) {
    return (
      <Pressable
        onPress={() => {
          tap();
          onPress();
        }}
        style={({ pressed }) => [st.card, pressed && { backgroundColor: C.surface2 }, style]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={[st.card, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: SP.xl }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SP.sm }}>
        <Txt v="h3">{title}</Txt>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Row({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <View style={st.row}>
      <Txt v="small">{k}</Txt>
      {typeof v === 'string' ? (
        <Txt v={mono ? 'mono' : 'body'} style={{ flex: 1, textAlign: 'right' }} selectable>
          {v}
        </Txt>
      ) : (
        v
      )}
    </View>
  );
}

export function ListItem({
  icon,
  iconColor = C.green,
  title,
  subtitle,
  right,
  onPress,
}: {
  icon?: IconName;
  iconColor?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  onPress?: () => void;
}) {
  const content = (
    <View style={st.listItem}>
      {icon ? (
        <View style={[st.listIcon, { backgroundColor: iconColor + '1F' }]}>
          <Feather name={icon} size={18} color={iconColor} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        {typeof title === 'string' ? <Txt v="body" numberOfLines={1}>{title}</Txt> : title}
        {subtitle ? (typeof subtitle === 'string' ? <Txt v="small" numberOfLines={1}>{subtitle}</Txt> : subtitle) : null}
      </View>
      {right}
      {onPress && !right ? <Feather name="chevron-right" size={18} color={C.faint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => pressed && { opacity: 0.7 }}
    >
      {content}
    </Pressable>
  );
}

// ───────────── Controles ─────────────

type BtnKind = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  busy,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: BtnKind;
  icon?: IconName;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
}) {
  const bg = kind === 'primary' ? C.green : kind === 'secondary' ? C.raised : kind === 'danger' ? C.badBg : 'transparent';
  const fg = kind === 'primary' ? C.greenInk : kind === 'danger' ? C.bad : C.text;
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled || busy}
      accessibilityRole="button"
      style={({ pressed }) => [
        st.btn,
        { backgroundColor: bg, borderColor: kind === 'ghost' ? C.lineStrong : bg, opacity: disabled ? 0.35 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Feather name={icon} size={18} color={fg} /> : null}
          <Text style={{ fontFamily: F.semibold, fontSize: 16, color: fg }}>{t(title)}</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Acción circular grande (Enviar, Recibir, Escanear…). */
export function Action({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      disabled={disabled}
      style={({ pressed }) => [{ alignItems: 'center', gap: 8, opacity: disabled ? 0.35 : pressed ? 0.7 : 1, flex: 1 }]}
    >
      <View style={st.action}>
        <Feather name={icon} size={22} color={C.green} />
      </View>
      <Txt v="label" color={C.text}>
        {label}
      </Txt>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label }: { icon: IconName; onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={10}
      accessibilityLabel={t(label)}
      style={st.iconBtn}
    >
      <Feather name={icon} size={20} color={C.text} />
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label: string; hint?: string; error?: string; right?: React.ReactNode }) {
  const { label, hint, error, right, style, ...rest } = props;
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: SP.lg }}>
      <Txt v="label" style={{ marginBottom: 6 }}>
        {label}
      </Txt>
      <View style={[st.inputWrap, focus && { borderColor: C.green }, error ? { borderColor: C.bad } : null]}>
        <TextInput
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          style={[st.input, style]}
          {...rest}
          placeholder={typeof rest.placeholder === 'string' ? t(rest.placeholder) : undefined}
        />
        {right}
      </View>
      {error ? (
        <Txt v="small" color={C.bad} style={{ marginTop: 4 }}>
          {error}
        </Txt>
      ) : hint ? (
        <Txt v="small" style={{ marginTop: 4 }}>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={st.seg}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={[st.segItem, on && st.segOn]}
          >
            <Text style={{ fontFamily: F.semibold, fontSize: 14, color: on ? C.greenInk : C.dim }}>{t(o.label)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Contador − n + (para pesos y quórum). */
export function Stepper({ value, min = 0, max = 99, onChange }: { value: number; min?: number; max?: number; onChange: (n: number) => void }) {
  return (
    <View style={st.stepper}>
      <Pressable hitSlop={8} onPress={() => value > min && (tap(), onChange(value - 1))} style={st.stepBtn}>
        <Feather name="minus" size={16} color={value > min ? C.text : C.faint} />
      </Pressable>
      <Text style={{ fontFamily: F.semibold, fontSize: 16, color: C.text, minWidth: 22, textAlign: 'center' }}>{value}</Text>
      <Pressable hitSlop={8} onPress={() => value < max && (tap(), onChange(value + 1))} style={st.stepBtn}>
        <Feather name="plus" size={16} color={value < max ? C.text : C.faint} />
      </Pressable>
    </View>
  );
}

export function Badge({ text, color = C.green, icon }: { text: string; color?: string; icon?: IconName }) {
  return (
    <View style={[st.badge, { backgroundColor: color + '1A' }]}>
      {icon ? <Feather name={icon} size={12} color={color} /> : null}
      <Text style={{ fontFamily: F.semibold, fontSize: 12, color }}>{t(text)}</Text>
    </View>
  );
}

export function Address({ value, short, label }: { value: string; short?: boolean; label?: string }) {
  const shown = short && value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-6)}` : value;
  return (
    <Pressable
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        tap();
        toast(t('{x} copiada', { x: t(label ?? 'Dirección') }));
      }}
      hitSlop={6}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Txt v="mono" color={C.dim} numberOfLines={1} style={{ flexShrink: 1 }}>
        {shown}
      </Txt>
      <Feather name="copy" size={12} color={C.faint} />
    </Pressable>
  );
}

export function Check({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  const color = ok === null ? C.faint : ok ? C.green : C.warn;
  return (
    <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 9 }}>
      <Feather name={ok === null ? 'circle' : ok ? 'check-circle' : 'alert-circle'} size={18} color={color} style={{ marginTop: 1 }} />
      <View style={{ flex: 1 }}>
        <Txt v="body">{label}</Txt>
        {detail ? <Txt v="small">{detail}</Txt> : null}
      </View>
    </View>
  );
}

export function Notice({ kind = 'warn', children }: { kind?: 'warn' | 'bad' | 'info'; children: React.ReactNode }) {
  const color = kind === 'warn' ? C.warn : kind === 'bad' ? C.bad : C.green;
  return (
    <View style={[st.notice, { backgroundColor: color + '14', borderColor: color + '40' }]}>
      <Feather name={kind === 'info' ? 'info' : 'alert-triangle'} size={16} color={color} style={{ marginTop: 2 }} />
      <Txt v="small" color={C.text} style={{ flex: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, gap: 10 }}>
      <View style={[st.action, { width: 64, height: 64, borderRadius: 32 }]}>
        <Feather name={icon} size={26} color={C.green} />
      </View>
      <Txt v="h3">{title}</Txt>
      {text ? (
        <Txt v="small" style={{ textAlign: 'center', maxWidth: 280 }}>
          {text}
        </Txt>
      ) : null}
      {action}
    </View>
  );
}

export function BusySheet({ visible, text }: { visible: boolean; text: string }) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={st.sheetWrap}>
        <View style={st.sheet}>
          <ActivityIndicator color={C.green} size="large" />
          <Txt v="body" style={{ textAlign: 'center', marginTop: 16 }}>
            {text}
          </Txt>
        </View>
      </View>
    </Modal>
  );
}

// ───────────── Monto ─────────────

/**
 * Entrada grande de monto con atajos de porcentaje (10 %, 25 %, 50 %, Máx).
 * El tamaño de letra se ajusta al largo para que el número nunca se corte.
 */
export function AmountInput({
  value,
  onChange,
  unit,
  sub,
  onPercent,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  unit: string;
  sub?: string;
  onPercent?: (pct: number) => void;
  error?: boolean;
}) {
  const len = Math.max(1, value.length);
  const size = len <= 7 ? 40 : len <= 10 ? 32 : len <= 13 ? 26 : 22;
  return (
    <View style={[st.card, { paddingVertical: SP.xl, borderColor: error ? C.bad : C.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', alignSelf: 'stretch' }}>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={C.faint}
          selectionColor={C.green}
          maxLength={18}
          style={{ fontFamily: F.bold, fontSize: size, color: error ? C.bad : C.text, textAlign: 'right', minWidth: 40, maxWidth: '75%', padding: 0 }}
          accessibilityLabel="Monto"
        />
        <Text style={{ fontFamily: F.semibold, fontSize: Math.round(size * 0.5), color: C.dim, marginLeft: 8 }}>{unit}</Text>
      </View>
      {sub ? (
        <Text style={{ fontFamily: F.medium, fontSize: 14, color: C.dim, textAlign: 'center', marginTop: 6 }} numberOfLines={1}>
          {tr(sub)}
        </Text>
      ) : null}
      {onPercent ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: SP.lg }}>
          {[10, 25, 50, 100].map((p) => (
            <Pressable
              key={p}
              onPress={() => {
                tap();
                onPercent(p);
              }}
              style={({ pressed }) => ({
                flex: 1,
                paddingVertical: 9,
                borderRadius: R.pill,
                alignItems: 'center',
                backgroundColor: pressed ? C.greenGlow : C.raised,
                borderWidth: 1,
                borderColor: p === 100 ? C.green + '55' : C.line,
              })}
            >
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: p === 100 ? C.green : C.text }}>{p === 100 ? t('Máx') : `${p} %`}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

// ───────────── Marca ─────────────

/**
 * Logo de Quorum: puerta de bóveda con volante de tres brazos (los firmantes).
 * Mismo dibujo y mismo degradado que el logo del sitio y del ícono (assets/brand/logo.svg):
 * verde #5CF7B0 arriba a la izquierda → #10B26A abajo a la derecha, cruzando todo el logo.
 *
 * Coordenadas con origen en 0 (sin viewBox desplazado) y un id de degradado único por
 * logo: así iOS y Android pintan el degradado igual que el navegador.
 */
export const LOGO_GRADIENT = { from: '#5CF7B0', to: '#10B26A' } as const;
const LOGO_W = 700;
const LOGO_H = 650; // incluye el grosor del borde (sin recortes)
const LOGO_Y0 = -3; // el marco empieza en y=0; deja aire arriba y abajo
const DIAL = { cx: 372, cy: 322, r: 215 };

function LogoGradient({ id }: { id: string }) {
  return (
    <Defs>
      <LinearGradient id={id} x1="50" y1="-10" x2="690" y2="670" gradientUnits="userSpaceOnUse">
        <Stop offset="0" stopColor={LOGO_GRADIENT.from} />
        <Stop offset="1" stopColor={LOGO_GRADIENT.to} />
      </LinearGradient>
    </Defs>
  );
}

/** Marco de la bóveda (sin la rueda). */
function LogoBody({ g }: { g: string }) {
  return (
    <>
      <Rect x={72} y={22} width={600} height={600} rx={112} fill="none" stroke={g} strokeWidth={44} />
      <Rect x={26} y={128} width={62} height={96} rx={20} fill={g} />
      <Rect x={26} y={420} width={62} height={96} rx={20} fill={g} />
    </>
  );
}

/** Rueda: tres brazos (los firmantes) unidos en el centro (el quórum). */
function LogoDial({ g }: { g: string }) {
  const { cx, cy } = DIAL;
  // brazos: desde el borde del anillo central hasta cada firmante (el centro queda libre)
  const arms = [
    [372, 249, 372, 166],
    [308.8, 358.5, 237, 400],
    [435.2, 358.5, 507, 400],
  ];
  return (
    <>
      <Circle cx={cx} cy={cy} r={196} fill="none" stroke={g} strokeWidth={30} opacity={0.55} />
      <G stroke={g} strokeWidth={38} strokeLinecap="round">
        {arms.map(([x1, y1, x, y]) => (
          <Line key={`${x}-${y}`} x1={x1} y1={y1} x2={x} y2={y} />
        ))}
      </G>
      {arms.map(([, , x, y]) => (
        <Circle key={`d${x}-${y}`} cx={x} cy={y} r={34} fill={g} />
      ))}
      <Circle cx={cx} cy={cy} r={58} fill={C.bg} stroke={g} strokeWidth={30} />
    </>
  );
}

/**
 * Logo de Quorum. Con `dial` (grados, Animated.Value) la rueda se dibuja aparte y gira
 * sobre su propio eje: se usa para la animación de "abrir la bóveda" al desbloquear.
 */
export function Logo({ size = 40, dial }: { size?: number; dial?: Animated.Value }) {
  const id = 'qlg' + React.useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = `url(#${id})`;
  if (!dial) {
    return (
      <Svg width={size} height={size} viewBox={`0 ${LOGO_Y0} ${LOGO_W} ${LOGO_H}`}>
        <LogoGradient id={id} />
        <LogoBody g={g} />
        <LogoDial g={g} />
      </Svg>
    );
  }
  // viewBox 700×650 dentro de un cuadrado: escala por el ancho, centrado en vertical
  const k = size / LOGO_W;
  const offY = (size - LOGO_H * k) / 2;
  const box = 2 * DIAL.r * k;
  const cx = DIAL.cx * k;
  const cy = (DIAL.cy - LOGO_Y0) * k + offY;
  const rotate = dial.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  const idDial = id + 'd';
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 ${LOGO_Y0} ${LOGO_W} ${LOGO_H}`}>
        <LogoGradient id={id} />
        <LogoBody g={g} />
      </Svg>
      <Animated.View style={{ position: 'absolute', left: cx - box / 2, top: cy - box / 2, width: box, height: box, transform: [{ rotate }] }}>
        <Svg width={box} height={box} viewBox={`0 0 ${2 * DIAL.r} ${2 * DIAL.r}`}>
          <LogoGradient id={idDial} />
          <G transform={`translate(${-(DIAL.cx - DIAL.r)} ${-(DIAL.cy - DIAL.r)})`}>
            <LogoDial g={`url(#${idDial})`} />
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * Anillo de quórum: un segmento por firmante (proporcional a su peso),
 * encendido cuando ya firmó. El elemento distintivo de Quorum.
 */
export function QuorumRing({
  size = 96,
  segments,
  center,
  sub,
}: {
  size?: number;
  segments: { weight: number; on: boolean }[];
  center: string;
  sub?: string;
}) {
  const stroke = Math.max(6, size * 0.085);
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const total = segments.reduce((a, s) => a + s.weight, 0) || 1;
  const gap = segments.length > 1 ? 0.06 : 0; // radianes
  let angle = -Math.PI / 2;
  const arcs = segments.map((s, i) => {
    const sweep = (s.weight / total) * Math.PI * 2 - gap;
    const a0 = angle + gap / 2;
    const a1 = a0 + Math.max(0.01, sweep);
    angle += (s.weight / total) * Math.PI * 2;
    const p = (a: number) => `${cx + r * Math.cos(a)} ${cx + r * Math.sin(a)}`;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d = segments.length === 1 ? undefined : `M ${p(a0)} A ${r} ${r} 0 ${large} 1 ${p(a1)}`;
    return { d, on: s.on, key: i };
  });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        {arcs.map((a) =>
          a.d ? (
            <Path key={a.key} d={a.d} stroke={a.on ? C.green : C.lineStrong} strokeWidth={stroke} strokeLinecap="round" fill="none" />
          ) : (
            <Circle key={a.key} cx={cx} cy={cx} r={r} stroke={a.on ? C.green : C.lineStrong} strokeWidth={stroke} fill="none" />
          ),
        )}
      </Svg>
      <Text style={{ fontFamily: F.bold, fontSize: size * 0.24, color: C.text, letterSpacing: -0.5 }}>{center}</Text>
      {sub ? <Text style={{ fontFamily: F.medium, fontSize: Math.max(10, size * 0.11), color: C.dim }}>{tr(sub)}</Text> : null}
    </View>
  );
}

const buildSt = () =>
  StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SP.md,
    paddingBottom: 8,
    backgroundColor: C.bg,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surface2,
  },
  card: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.line,
    padding: SP.lg,
    marginBottom: SP.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, gap: SP.md },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: SP.md, paddingVertical: 12 },
  listIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btn: {
    minHeight: 52,
    borderRadius: R.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP.lg,
    marginTop: SP.sm,
  },
  action: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: C.greenGlow,
    borderWidth: 1,
    borderColor: 'rgba(60,242,156,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface2,
    borderRadius: R.sm + 2,
    borderWidth: 1,
    borderColor: C.line,
    paddingRight: 8,
  },
  input: { flex: 1, color: C.text, fontFamily: F.regular, fontSize: 16, paddingHorizontal: 14, paddingVertical: 14 },
  seg: { flexDirection: 'row', backgroundColor: C.surface2, borderRadius: R.md, padding: 4, marginBottom: SP.lg },
  segItem: { flex: 1, paddingVertical: 10, borderRadius: R.sm + 2, alignItems: 'center' },
  segOn: { backgroundColor: C.green },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.surface2,
    borderRadius: R.pill,
    padding: 4,
    borderWidth: 1,
    borderColor: C.line,
  },
  stepBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: R.pill, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  notice: { flexDirection: 'row', gap: 10, borderRadius: R.sm + 2, borderWidth: 1, padding: SP.md, marginVertical: SP.sm },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.raised,
    borderWidth: 1,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  sheetWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 32 },
  sheet: { backgroundColor: C.surface, borderRadius: R.lg, padding: 28, borderWidth: 1, borderColor: C.line },
  });
/** Estilos base; se reconstruyen en el lugar al cambiar de tema. */
export const st = buildSt();
onThemeChange(() => Object.assign(st, buildSt()));


/** Ícono de una cuenta con su color: candado para bóvedas, el dispositivo para cuentas normales. */
export function AccountAvatar({
  color,
  icon,
  size = 40,
}: {
  color?: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  size?: number;
}) {
  const c = accountColor(color);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.3,
        backgroundColor: alpha(c, 0.16),
        borderWidth: 1,
        borderColor: alpha(c, 0.45),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Feather name={icon} size={size * 0.45} color={c} />
    </View>
  );
}

/** Selector de color de cuenta. */
export function ColorPicker({ value, onChange }: { value?: string; onChange: (key: string) => void }) {
  const current = value ?? ACCOUNT_COLORS[0].key;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
      {ACCOUNT_COLORS.map((c) => {
        const on = c.key === current;
        return (
          <Pressable
            key={c.key}
            accessibilityLabel={c.name}
            onPress={() => {
              tap();
              onChange(c.key);
            }}
            hitSlop={4}
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: c.color,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: on ? 3 : 0,
              borderColor: C.text,
            }}
          >
            {on ? <Feather name="check" size={16} color={C.greenInk} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
