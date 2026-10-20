import React from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { AppProvider, useApp } from './src/state';
import { NavProvider, Route, SlideIn, Tab, useNav } from './src/nav';
import { C, F, ThemeName, applyTheme, themeName } from './src/ui/theme';
import { Lang, setLang, systemLang, t as tt } from './src/i18n';
import { patchAlert } from './src/i18n/alert';
patchAlert();
import { ToastHost, tap } from './src/ui/components';
import { OfflineBanner } from './src/ui/OfflineBanner';
import { useIncomingProposalLinks } from './src/ui/incomingLinks';
import { Glass, hasGlass, setNativeSelectors } from './src/ui/Glass';
import HomeScreen from './src/screens/HomeScreen';
import AccountScreen from './src/screens/AccountScreen';
import ActivityScreen from './src/screens/ActivityScreen';
import SendScreen from './src/screens/SendScreen';
import ReceiveScreen from './src/screens/ReceiveScreen';
import NftsScreen from './src/screens/NftsScreen';
import SwapScreen from './src/screens/SwapScreen';
import TradeScreen from './src/screens/TradeScreen';
import ProposalScreen from './src/screens/ProposalScreen';
import ProposalsScreen from './src/screens/ProposalsScreen';
import { ScanScreen, ShowQrScreen } from './src/screens/QrScreens';
import VaultWizardScreen from './src/screens/VaultWizardScreen';
import SecurityScreen from './src/screens/SecurityScreen';
import { AddDeviceScreen, DevicesScreen } from './src/screens/DevicesScreen';
import AddAccountScreen from './src/screens/AddAccountScreen';
import SettingsScreen, { ContactsScreen } from './src/screens/SettingsScreen';
import AboutScreen, { DonateScreen } from './src/screens/AboutScreen';
import PayRequestScreen from './src/screens/PayRequestScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import RegisterReleaseScreen from './src/screens/RegisterReleaseScreen';
import BadgesScreen from './src/screens/BadgesScreen';
import GuideScreen from './src/screens/GuideScreen';
import UnvaultScreen from './src/screens/UnvaultScreen';
import FinishVaultScreen from './src/screens/FinishVaultScreen';
import BackupScreen from './src/screens/BackupScreen';
import ReorderScreen from './src/screens/ReorderScreen';
import ChartsScreen from './src/screens/ChartsScreen';
import { LockScreen, Onboarding, TermsScreen, useAppLock } from './src/screens/GateScreens';
import { TERMS_VERSION } from './src/legal';
import { ReminderScreen, TermsReviewScreen } from './src/screens/ReviewScreens';
import { needsReview } from './src/core/reminder';
import PickNftScreen from './src/screens/PickNftScreen';
import { XrpLoader } from './src/ui/XrpLoader';
import { CelebrateHost } from './src/ui/Celebrate';

function RouteView({ r }: { r: Route }) {
  switch (r.name) {
    case 'account':
      return <AccountScreen id={r.params.id} />;
    case 'send':
      return <SendScreen {...r.params} />;
    case 'receive':
      return <ReceiveScreen id={r.params.id} />;
    case 'payRequest':
      return <PayRequestScreen req={r.params.req} />;
    case 'nfts':
      return <NftsScreen id={r.params.id} />;
    case 'swap':
      return <SwapScreen id={r.params.id} />;
    case 'trade':
      return <TradeScreen id={r.params.id} />;
    case 'security':
      return <SecurityScreen id={r.params.id} />;
    case 'vaultWizard':
      return <VaultWizardScreen id={r.params.id} />;
    case 'addAccount':
      return <AddAccountScreen />;
    case 'devices':
      return <DevicesScreen />;
    case 'addDevice':
      return <AddDeviceScreen kind={r.params.kind} />;
    case 'proposal':
      return <ProposalScreen id={r.params.id} />;
    case 'showQr':
      return <ShowQrScreen id={r.params.id} />;
    case 'scan':
      return <ScanScreen {...r.params} />;
    case 'about':
      return <AboutScreen />;
    case 'verify':
      return <VerifyScreen />;
    case 'registerRelease':
      return <RegisterReleaseScreen id={r.params.id} />;
    case 'badges':
      return <BadgesScreen id={r.params.id} />;
    case 'donate':
      return <DonateScreen />;
    case 'guide':
      return <GuideScreen />;
    case 'unvault':
      return <UnvaultScreen id={r.params.id} />;
    case 'finishVault':
      return <FinishVaultScreen id={r.params.id} />;
    case 'pickNft':
      return <PickNftScreen id={r.params.id} />;
    case 'terms':
      return <TermsReviewScreen />;
    case 'backup':
      return <BackupScreen />;
    case 'reorder':
      return <ReorderScreen kind={r.params.kind} />;
    case 'contacts':
      return <ContactsScreen />;
    case 'charts':
      return <ChartsScreen view={r.params.view} />;
    default:
      return null;
  }
}

const TABS: { key: Tab; label: string; icon: React.ComponentProps<typeof Feather>['name'] }[] = [
  { key: 'home', label: 'Inicio', icon: 'home' },
  { key: 'activity', label: 'Actividad', icon: 'activity' },
  { key: 'proposals', label: 'Firmas', icon: 'edit-3' },
  { key: 'settings', label: 'Ajustes', icon: 'settings' },
];

function TabBar() {
  const nav = useNav();
  const app = useApp();
  const insets = useSafeAreaInsets();
  const pending = app.proposals.filter((p) => p.status === 'collecting' || p.status === 'ready').length;
  const glass = hasGlass();
  // lente que se desliza a la pestaña elegida (solo en la barra de vidrio)
  const tabIdx = Math.max(0, TABS.findIndex((x) => x.key === nav.tab));
  const [barW, setBarW] = React.useState(0);
  const itemW = barW > 0 ? (barW - 8) / TABS.length : 0;
  const lensX = React.useRef(new Animated.Value(0)).current;
  const lensS = React.useRef(new Animated.Value(1)).current;
  const first = React.useRef(true);
  React.useEffect(() => {
    if (!itemW) return;
    if (first.current) {
      first.current = false;
      lensX.setValue(tabIdx * itemW);
      return;
    }
    Animated.parallel([
      Animated.spring(lensX, { toValue: tabIdx * itemW, useNativeDriver: true, friction: 8, tension: 90 }),
      Animated.sequence([
        Animated.timing(lensS, { toValue: 1.18, duration: 120, useNativeDriver: true }),
        Animated.spring(lensS, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }),
      ]),
    ]).start();
  }, [tabIdx, itemW]);
  const scan = () => {
    tap();
    nav.push('scan', { purpose: 'any' });
  };
  const item = (t: (typeof TABS)[number]) => {
    const on = nav.tab === t.key;
    return (
      <Pressable
        key={t.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => {
          tap();
          nav.setTab(t.key);
        }}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: glass ? 0 : 10 }}
      >
        <View>
          <Feather name={t.icon} size={22} color={on ? C.green : C.faint} />
          {t.key === 'proposals' && pending > 0 && (
            <View style={{ position: 'absolute', top: -4, right: -10, backgroundColor: C.warn, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 10, color: C.greenInk }}>{pending}</Text>
            </View>
          )}
        </View>
        <Text style={{ fontFamily: F.medium, fontSize: 11, color: on ? C.text : C.faint, marginTop: 4 }}>{tt(t.label)}</Text>
      </Pressable>
    );
  };
  // iOS 26: barra flotante de vidrio (el contenido pasa por detrás) y botón de escanear aparte
  if (glass) {
    return (
      <View
        pointerEvents="box-none"
        style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom - 8, 12), paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}
      >
        <Glass style={{ flex: 1, height: 64, borderRadius: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
          <View style={StyleSheet.absoluteFill} onLayout={(e) => setBarW(e.nativeEvent.layout.width)} pointerEvents="none">
            {itemW > 0 && (
              <Animated.View
                style={{
                  position: 'absolute',
                  top: 6,
                  bottom: 6,
                  left: 4,
                  width: itemW,
                  borderRadius: 26,
                  backgroundColor: themeName() === 'light' ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.13)',
                  transform: [{ translateX: lensX }, { scaleX: lensS }],
                }}
              />
            )}
          </View>
          {item(TABS[0])}
          {item(TABS[1])}
          {item(TABS[2])}
          {item(TABS[3])}
        </Glass>
        <Glass interactive tint={C.green} style={{ width: 64, height: 64, borderRadius: 32 }}>
          <Pressable accessibilityLabel={tt('Escanear')} onPress={scan} style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="maximize" size={24} color={C.greenInk} />
          </Pressable>
        </Glass>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: insets.bottom || 10 }}>
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          accessibilityLabel="Escanear"
          onPress={scan}
          style={({ pressed }) => ({
            marginTop: -18,
            width: 58,
            height: 58,
            borderRadius: 20,
            backgroundColor: C.green,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.85 : 1,
            shadowColor: C.green,
            shadowOpacity: 0.45,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 4 },
          })}
        >
          <Feather name="maximize" size={24} color={C.greenInk} />
        </Pressable>
      </View>
      {item(TABS[2])}
      {item(TABS[3])}
    </View>
  );
}

function Shell() {
  const app = useApp();
  const nav = useNav();
  const lock = useAppLock(app.settings.lockEnabled && app.settings.onboarded, app.ready, app.settings.lockAfterSec ?? 0, !!app.busy);
  // Operaciones compartidas por enlace: se abren cuando la app está lista y el aviso aceptado.
  useIncomingProposalLinks(app.ready && app.settings.onboarded && (app.settings.termsAccepted ?? 0) >= TERMS_VERSION);
  // Las pantallas siguen montadas bajo el bloqueo: al desbloquear se actualizan los saldos.
  const wasLocked = React.useRef(false);
  React.useEffect(() => {
    if (wasLocked.current && !lock.locked && app.ready) app.refreshAll();
    wasLocked.current = lock.locked;
  }, [lock.locked]);

  // Apariencia e idioma: se aplican antes de dibujar; al cambiar, `uiKey` vuelve a montar las
  // pantallas (sin perder la navegación ni el desbloqueo) para que tomen colores y textos nuevos.
  const scheme = useColorScheme();
  const pref = app.settings.appearance ?? 'system';
  const theme: ThemeName = pref === 'system' ? (scheme === 'light' ? 'light' : 'dark') : pref;
  const langPref = app.settings.language ?? 'system';
  const uiLang: Lang = langPref === 'system' ? systemLang() : langPref;
  applyTheme(theme);
  setLang(uiLang);
  setNativeSelectors(!!app.settings.nativeSelectors);
  const uiKey = `${theme}-${uiLang}-${app.settings.nativeSelectors ? 'n' : 'q'}`;
  const bar = <StatusBar style={theme === 'light' ? 'dark' : 'light'} />;

  const reviewDue = React.useRef<boolean | null>(null);
  if (app.ready && reviewDue.current === null) reviewDue.current = needsReview(app.settings, Date.now());

  if (!app.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        {bar}
        <XrpLoader size={56} label={null} />
      </View>
    );
  }
  if (!app.settings.onboarded) return <View key={uiKey} style={{ flex: 1 }}>{bar}<Onboarding /></View>;
  // El bloqueo va como capa encima de la app, no en su lugar: así lo que estabas haciendo
  // (un formulario a medio llenar, los firmantes elegidos) sigue ahí al desbloquear.
  // Es un Modal para quedar también por encima de otras ventanas abiertas (escáner, números secretos).
  const hidden = lock.locked ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const } : {};
  const lockLayer = (
    <Modal visible={lock.locked} transparent animationType="none" statusBarTranslucent onRequestClose={() => {}}>
      {lock.locked ? <LockScreen onUnlock={lock.unlock} onFinish={lock.finish} method={app.settings.lockMethod ?? 'faceid'} /> : null}
    </Modal>
  );
  if ((app.settings.termsAccepted ?? 0) < TERMS_VERSION) return <View key={uiKey} style={{ flex: 1 }}>{bar}<View style={{ flex: 1 }} {...hidden}><TermsScreen /></View>{lockLayer}</View>;
  // recordatorio mensual: se decide al abrir la app (no interrumpe una operación en curso)
  if (reviewDue.current && needsReview(app.settings, Date.now())) return <View key={uiKey} style={{ flex: 1 }}>{bar}<View style={{ flex: 1 }} {...hidden}><ReminderScreen /></View>{lockLayer}</View>;

  const top = nav.stack[nav.stack.length - 1];
  return (
    <View key={uiKey} style={{ flex: 1, backgroundColor: C.bg }}>
      {bar}
      <View style={{ flex: 1 }} {...hidden}>
        {top ? (
          <SlideIn k={`${nav.stack.length}:${top.name}`} depth={nav.stack.length} onBack={nav.pop}>
            <RouteView r={top} />
          </SlideIn>
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {nav.tab === 'home' && <HomeScreen />}
              {nav.tab === 'activity' && <ActivityScreen />}
              {nav.tab === 'proposals' && <ProposalsScreen />}
              {nav.tab === 'settings' && <SettingsScreen />}
            </View>
            <TabBar />
          </>
        )}
        <OfflineBanner onBackOnline={app.refreshAll} />
        <CelebrateHost />
        <ToastHost />
      </View>
      {lockLayer}
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  return (
    <SafeAreaProvider>
      {fontsLoaded ? (
        <AppProvider>
          <NavProvider>
            <Shell />
          </NavProvider>
        </AppProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: C.bg }} />
      )}
    </SafeAreaProvider>
  );
}
