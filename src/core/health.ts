import type { AccountState } from './network';

/** Mínimo de firmantes (los de mayor peso) para alcanzar el quórum. */
export function minSigners(list: { quorum: number; entries: { weight: number }[] }): number {
  const w = list.entries.map((e) => e.weight).sort((a, b) => b - a);
  let acc = 0;
  for (let i = 0; i < w.length; i++) {
    acc += w[i];
    if (acc >= list.quorum) return i + 1;
  }
  return Infinity;
}

/** Cuántos dispositivos puedes perder (peor caso) y aún alcanzar el quórum. */
export function lossTolerance(list: { quorum: number; entries: { weight: number }[] }): number {
  const w = list.entries.map((e) => e.weight).sort((a, b) => b - a);
  let remaining = w.reduce((a, b) => a + b, 0);
  let k = 0;
  for (const x of w) {
    if (remaining - x >= list.quorum) {
      remaining -= x;
      k++;
    } else break;
  }
  return k;
}

export type HealthLevel = 'secure' | 'partial' | 'open' | 'unknown';

export interface HealthCheck {
  key: string;
  ok: boolean;
  label: string;
  detail?: string;
  fix?: 'signers' | 'disableMaster' | 'harden' | 'removeRegular' | 'tickets';
}

export function vaultHealth(st?: AccountState): { level: HealthLevel; checks: HealthCheck[]; summary: string } {
  if (!st || !st.exists) return { level: 'unknown', checks: [], summary: st ? 'Cuenta sin activar' : 'Sin datos' };
  const list = st.signerList;
  const need = list ? minSigners(list) : 0;
  const tol = list ? lossTolerance(list) : 0;
  const hardened = st.hardening.every((h) => h.on);
  const checks: HealthCheck[] = [
    {
      key: 'list',
      ok: !!list && need >= 2,
      label: list ? `Multifirma ${need} de ${list.entries.length}` : 'Sin multifirma',
      detail: list ? (need >= 2 ? 'Ningún dispositivo puede mover fondos solo' : 'Un solo dispositivo basta para mover todo') : 'Configura los firmantes',
      fix: 'signers',
    },
    {
      key: 'tolerance',
      ok: !!list && tol >= 1,
      label: list ? (tol >= 1 ? `Tolera perder ${tol} dispositivo${tol > 1 ? 's' : ''}` : 'No tolera perder ningún dispositivo') : 'Respaldo de dispositivos',
      detail: list && tol < 1 ? 'Si pierdes uno, la bóveda queda bloqueada' : undefined,
      fix: 'signers',
    },
    {
      key: 'master',
      ok: st.masterDisabled,
      label: st.masterDisabled ? 'Master key desactivada' : 'Master key activa',
      detail: st.masterDisabled ? 'Solo el quórum controla la cuenta' : 'La clave original aún puede mover todo',
      fix: 'disableMaster',
    },
    {
      key: 'regular',
      ok: !st.regularKey,
      label: st.regularKey ? 'Clave regular asignada' : 'Sin clave regular',
      detail: st.regularKey ? 'Una sola clave podría saltarse la multifirma' : undefined,
      fix: 'removeRegular',
    },
    {
      key: 'harden',
      ok: hardened,
      label: hardened ? 'Entradas no deseadas bloqueadas' : 'Acepta líneas, cheques y ofertas de terceros',
      detail: hardened ? 'Solo puede recibir pagos' : 'Bloquéalas para reducir spam y riesgos',
      fix: 'harden',
    },
  ];
  const core = checks.filter((c) => c.key !== 'harden');
  const level: HealthLevel = core.every((c) => c.ok) ? (hardened ? 'secure' : 'partial') : list ? 'partial' : 'open';
  const summary = level === 'secure' ? 'Protegida' : level === 'partial' ? 'Configuración incompleta' : 'Sin protección';
  return { level, checks, summary };
}
