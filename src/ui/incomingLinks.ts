/**
 * Abre en Quorum las operaciones compartidas por enlace (https://quorumxrpl.com/p#… o quorum://p#…):
 * las importa igual que un QR escaneado y muestra la operación para revisarla y firmar.
 */
import { useEffect, useRef } from 'react';
import * as Linking from 'expo-linking';
import { useApp } from '../state';
import { useNav } from '../nav';
import { parseSharedProposal, SharedProposal } from '../core/share';
import { t } from '../i18n';
import { toast } from './components';

export function useIncomingProposalLinks(ready: boolean) {
  const app = useApp();
  const nav = useNav();
  const pending = useRef<SharedProposal | null>(null);

  const open = async (s: SharedProposal) => {
    try {
      const r = await app.importQr(s.qr, { from: s.from, note: s.note });
      toast(r.isNew ? 'Operación recibida' : r.added > 0 ? r.added > 1 ? t('{n} firmas agregadas', { n: r.added }) : t('1 firma agregada') : 'Sin firmas nuevas', r.added > 0 || r.isNew ? 'ok' : 'warn');
      nav.push('proposal', { id: r.proposal.id });
    } catch (e: any) {
      toast(e?.message ?? String(e), 'bad');
    }
  };

  // Enlace con el que se abrió la app y los que llegan mientras está abierta.
  useEffect(() => {
    const take = (url: string | null) => {
      const s = parseSharedProposal(url);
      if (s) pending.current = s;
    };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => {
      take(url);
      if (ready && pending.current) {
        const s = pending.current;
        pending.current = null;
        open(s);
      }
    });
    return () => sub.remove();
  }, [ready]);

  // Cuando la app termina de cargar (y se aceptó el aviso), se abre lo que quedó pendiente.
  useEffect(() => {
    if (!ready || !pending.current) return;
    const s = pending.current;
    pending.current = null;
    open(s);
  }, [ready]);
}
