import { Alert } from 'react-native';
import { tr } from './index';

/** Los avisos del sistema (Alert.alert) también se traducen: título, mensaje y botones. */
let alertPatched = false;
export function patchAlert() {
  if (alertPatched) return;
  alertPatched = true;
  const orig = Alert.alert.bind(Alert);
  (Alert as any).alert = (title: string, message?: string, buttons?: any[], options?: any) =>
    orig(
      tr(title),
      message === undefined ? undefined : tr(message),
      buttons?.map((b) => (b && typeof b.text === 'string' ? { ...b, text: tr(b.text) } : b)),
      options,
    );
}
