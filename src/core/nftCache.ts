/**
 * Caché de la metadata de NFTs (nombre e imagen). La URI de un NFT no cambia, así que una
 * vez leída no hace falta volver a buscarla: la próxima vez la galería aparece al instante.
 * Si un NFT no tenía imagen, se reintenta después de un día. Si no se pudo leer (red lenta,
 * gateway caído) no se guarda nada: se vuelve a intentar la próxima vez.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NftItem, loadNftMetadata } from './network';

// v2: la v1 guardaba como "sin imagen" los NFTs que solo habían fallado por la red
const KEY = 'q.nftmeta.v2';
const MAX = 2000;
const RETRY_MISSING_MS = 24 * 60 * 60 * 1000;

type Meta = { u?: string; n?: string; i?: string; t: number };
let mem: Record<string, Meta> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

async function cache(): Promise<Record<string, Meta>> {
  if (!mem) {
    try {
      mem = JSON.parse((await AsyncStorage.getItem(KEY)) || '{}') ?? {};
    } catch {
      mem = {};
    }
  }
  return mem!;
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!mem) return;
    const keys = Object.keys(mem);
    if (keys.length > MAX) {
      keys.sort((a, b) => mem![a].t - mem![b].t).slice(0, keys.length - MAX).forEach((k) => delete mem![k]);
    }
    AsyncStorage.setItem(KEY, JSON.stringify(mem)).catch(() => {});
  }, 600);
}

/** Aplica lo que ya está en caché. Devuelve la lista y cuáles faltan por leer. */
export async function withCachedMeta(list: NftItem[]): Promise<{ items: NftItem[]; pending: NftItem[] }> {
  const c = await cache();
  const now = Date.now();
  const pending: NftItem[] = [];
  const items = list.map((n) => {
    const m = c[n.id];
    if (m && m.u === n.uri && (m.i || now - m.t < RETRY_MISSING_MS)) return { ...n, name: m.n ?? n.name, image: m.i };
    pending.push(n);
    return n;
  });
  return { items, pending };
}

/**
 * Lee la metadata de los NFTs pendientes con varias descargas en paralelo (sin esperar a
 * que termine un grupo para empezar el siguiente) y avisa cada vez que uno termina.
 */
export async function loadMetaParallel(
  pending: NftItem[],
  onDone: (n: NftItem) => void,
  isAlive: () => boolean,
  concurrency = 8,
): Promise<void> {
  const c = await cache();
  let next = 0;
  const worker = async () => {
    while (next < pending.length && isAlive()) {
      const n = pending[next++];
      let r = await loadNftMetadata(n);
      if (r.metaFailed) {
        // falló la red: se conserva lo que ya sabíamos y no se guarda nada nuevo
        const m = c[n.id];
        if (m && m.u === n.uri && m.i) r = { ...n, name: m.n ?? n.name, image: m.i };
      } else {
        c[n.id] = { u: n.uri, n: r.name, i: r.image, t: Date.now() };
        persist();
      }
      if (isAlive()) onDone(r);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
}
