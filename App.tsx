import React from 'react';
import { ActivityIndicator, Pressable, Text, View, useColorScheme } from 'react-native';
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
import { C, F, ThemeName, applyTheme } from './src/ui/theme';
import { Lang, setLang, systemLang, t as tt } from './src/i18n';
import { patchAlert } from './src/i18n/alert';
patchAlert();
import { ToastHost, tap } from './src/ui/components';
import { OfflineBanner } from './src/ui/OfflineBanner';
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

function RouteView({ r }: { r: Route }) {
  switch (r.name) {
    case 'account':
      return <AccountScreen id={r.params.id} />;
    case 'send':
      return <SendScreen {...r.params} />;
    case 'receive':
      return <ReceiveScreen id={r.params.id} />;
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
        style={{ flex: 1, alignItems: 'center', paddingTop: 10 }}
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
  return (
    <View style={{ flexDirection: 'row', backgroundColor: C.surface, borderTopWidth: 1, borderTopColor: C.line, paddingBottom: insets.bottom || 10 }}>
      {item(TABS[0])}
      {item(TABS[1])}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Pressable
          accessibilityLabel="Escanear"
          onPress={() => {
            tap();
            nav.push('scan', { purpose: 'any' });
          }}
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

  // Apariencia e idioma: se aplican antes de dibujar; al cambiar, `uiKey` vuelve a montar las
  // pantallas (sin perder la navegación ni el desbloqueo) para que tomen colores y textos nuevos.
  const scheme = useColorScheme();
  const pref = app.settings.appearance ?? 'system';
  const theme: ThemeName = pref === 'system' ? (scheme === 'light' ? 'light' : 'dark') : pref;
  const langPref = app.settings.language ?? 'system';
  const uiLang: Lang = langPref === 'system' ? systemLang() : langPref;
  applyTheme(theme);
  setLang(uiLang);
  const uiKey = `${theme}-${uiLang}`;
  const bar = <StatusBar style={theme === 'light' ? 'dark' : 'light'} />;

  const reviewDue = React.useRef<boolean | null>(null);
  if (app.ready && reviewDue.current === null) reviewDue.current = needsReview(app.settings, Date.now());

  if (!app.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        {bar}
        <ActivityIndicator color={C.green} />
      </View>
    );
  }
  if (!app.settings.onboarded) return <View key={uiKey} style={{ flex: 1 }}>{bar}<Onboarding /></View>;
  if (lock.locked) return <View key={uiKey} style={{ flex: 1 }}>{bar}<LockScreen onUnlock={lock.unlock} /></View>;
  if ((app.settings.termsAccepted ?? 0) < TERMS_VERSION) return <View key={uiKey} style={{ flex: 1 }}>{bar}<TermsScreen /></View>;
  // recordatorio mensual: se decide al abrir la app (no interrumpe una operación en curso)
  if (reviewDue.current && needsReview(app.settings, Date.now())) return <View key={uiKey} style={{ flex: 1 }}>{bar}<ReminderScreen /></View>;

  const top = nav.stack[nav.stack.length - 1];
  return (
    <View key={uiKey} style={{ flex: 1, backgroundColor: C.bg }}>
      {bar}
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
      <ToastHost />
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
