import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNftMetadata, NftItem } from '../src/core/network';

const base: NftItem = { id: 'A', issuer: 'r', taxon: 0, serial: 1, uri: 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/meta.json' };

test('si ningún gateway responde, el NFT queda marcado para reintentar (no "sin imagen")', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error('timeout');
  }) as any;
  try {
    const r = await loadNftMetadata(base);
    assert.equal(r.metaFailed, true);
    assert.equal(r.image, undefined);
  } finally {
    globalThis.fetch = orig;
  }
});

test('si responde con metadata, trae la imagen y no queda marcado', async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ name: 'X', image: 'ipfs://bafyImg/1.png' }), { headers: { 'content-type': 'application/json' } })) as any;
  try {
    const r = await loadNftMetadata(base);
    assert.equal(r.metaFailed, undefined);
    assert.equal(r.image, 'ipfs://bafyImg/1.png');
  } finally {
    globalThis.fetch = orig;
  }
});

test('si el primer gateway responde 429, gana el siguiente sin esperar todo el timeout', async () => {
  const orig = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (url: string) => {
    seen.push(url);
    if (seen.length === 1) return new Response('rate limited', { status: 429 });
    return new Response(JSON.stringify({ image: 'ipfs://bafyImg/2.png' }), { headers: { 'content-type': 'application/json' } });
  }) as any;
  try {
    const t0 = Date.now();
    const r = await loadNftMetadata(base);
    assert.equal(r.image, 'ipfs://bafyImg/2.png');
    assert.ok(Date.now() - t0 < 1000, 'no debió esperar el escalonado');
    assert.equal(seen.length, 2);
  } finally {
    globalThis.fetch = orig;
  }
});

test('un gateway lento no frena: a los ~1,2 s se suma otro y gana el más rápido', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = ((url: string, init: any) => {
    calls++;
    if (calls === 1)
      return new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('abort')))); // cuelga
    return Promise.resolve(new Response(JSON.stringify({ image: 'ipfs://bafyImg/3.png' }), { headers: { 'content-type': 'application/json' } }));
  }) as any;
  try {
    const r = await loadNftMetadata(base);
    assert.equal(r.image, 'ipfs://bafyImg/3.png');
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = orig;
  }
});

test('un 200 con HTML (página de error del gateway) no cuenta como metadata', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response('<html>blocked</html>', { headers: { 'content-type': 'text/html' } });
    return new Response(JSON.stringify({ image: 'ipfs://bafyImg/4.png' }), { headers: { 'content-type': 'application/json' } });
  }) as any;
  try {
    const r = await loadNftMetadata(base);
    assert.equal(r.image, 'ipfs://bafyImg/4.png');
  } finally {
    globalThis.fetch = orig;
  }
});
