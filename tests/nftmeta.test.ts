import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadNftMetadata, NftItem } from '../src/core/network';

const base: NftItem = { id: 'A', issuer: 'r', taxon: 0, serial: 1, uri: 'ipfs://bafyTest/meta.json' };

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
