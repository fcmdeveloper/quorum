/**
 * Protección contra "address poisoning" (direcciones parecidas).
 *
 * La estafa: alguien te manda montos mínimos desde una dirección que empieza y termina
 * igual que una de tus direcciones de confianza, para que la copies por error desde tu
 * actividad. Esta función detecta cuando una dirección se parece a una de confianza
 * sin ser la misma.
 */
import { t } from '../i18n';

export interface TrustedAddress {
  address: string;
  label: string;
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

/**
 * ¿`a` imita a `b`? Se ignora la "r" inicial (todas las direcciones la tienen).
 * Basta que coincidan los primeros 4 caracteres y los últimos 3, o 6 al inicio, o 5 al
 * final: es lo que la gente suele mirar, y por azar es prácticamente imposible.
 */
export function looksLike(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const x = a.replace(/^r/, '');
  const y = b.replace(/^r/, '');
  const pre = commonPrefix(x, y);
  const suf = commonSuffix(x, y);
  return (pre >= 4 && suf >= 3) || pre >= 6 || suf >= 5;
}

/** La dirección de confianza a la que `address` se parece (sin ser igual), o null. */
export function lookalikeOf(address: string, trusted: TrustedAddress[]): TrustedAddress | null {
  const a = address.trim();
  if (!a || trusted.some((t) => t.address === a)) return null;
  return trusted.find((t) => looksLike(a, t.address)) ?? null;
}

/** Direcciones de confianza: tus cuentas, tus dispositivos, tus contactos y los destinos permitidos. */
export function trustedAddresses(src: {
  accounts: { address: string; label: string; allowed?: string[] }[];
  devices: { address: string; label: string }[];
  contacts: { address: string; label: string }[];
}): TrustedAddress[] {
  const out = new Map<string, TrustedAddress>();
  const add = (address: string, label: string) => {
    if (address && !out.has(address)) out.set(address, { address, label });
  };
  src.accounts.forEach((a) => add(a.address, a.label));
  src.devices.forEach((d) => add(d.address, d.label));
  src.contacts.forEach((c) => add(c.address, c.label));
  src.accounts.forEach((a) => (a.allowed ?? []).forEach((x) => add(x, t('Destino permitido de {x}', { x: a.label }))));
  return [...out.values()];
}
