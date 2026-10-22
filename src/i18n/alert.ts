import { Alert, Platform } from 'react-native';
import { tr } from './index';

export type AlertButton = { text?: string; style?: 'default' | 'cancel' | 'destructive'; onPress?: () => void };
type Overflow = (title: string, message: string | undefined, buttons: AlertButton[], options?: { cancelable?: boolean }) => void;

/**
 * En Android todos los avisos se muestran con el menú propio de ActionSheet.tsx: el aviso del
 * sistema se ve distinto al resto de la app y muestra como máximo 3 botones (los demás desaparecen).
 */
let overflow: Overflow | null = null;
export function setAlertOverflow(fn: Overflow | null) {
  overflow = fn;
}

/** Los avisos del sistema (Alert.alert) también se traducen: título, mensaje y botones. */
let alertPatched = false;
export function patchAlert() {
  if (alertPatched) return;
  alertPatched = true;
  const orig = Alert.alert.bind(Alert);
  (Alert as any).alert = (title: string, message?: string, buttons?: any[], options?: any) => {
    const tTitle = tr(title);
    const tMessage = message === undefined ? undefined : tr(message);
    const tButtons = buttons?.map((b) => (b && typeof b.text === 'string' ? { ...b, text: tr(b.text) } : b));
    if (Platform.OS === 'android' && overflow) return overflow(tTitle, tMessage, tButtons?.length ? tButtons : [{ text: 'OK' }], options);
    return orig(tTitle, tMessage, tButtons, options);
  };
}
