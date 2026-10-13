import { Alert } from 'react-native';
import { PendingProposalError } from '../core/errors';

/** Muestra el error al crear una propuesta; si hay una pendiente, ofrece abrirla. */
export function proposalFailed(title: string, e: any, nav: { push: (name: 'proposal', params: { id: string }) => void }) {
  if (e instanceof PendingProposalError) {
    Alert.alert('Operación pendiente', e.message, [
      { text: 'Cerrar', style: 'cancel' },
      { text: 'Ver pendiente', onPress: () => nav.push('proposal', { id: e.proposalId }) },
    ]);
    return;
  }
  Alert.alert(title, e?.message ?? String(e));
}
