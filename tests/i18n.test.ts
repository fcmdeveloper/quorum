import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EN } from '../src/i18n/en';
import { setLang, t } from '../src/i18n';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

test('every literal t() key has an English translation', () => {
  const missing = new Set<string>();
  const re = /\bt\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const f of [...files('src'), 'App.tsx']) {
    if (f.includes('i18n')) continue;
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) {
      const key = m[2].replace(/\\(['"\\])/g, '$1').replace(/\\n/g, '\n');
      if (!(key in EN)) missing.add(`${f}: ${key}`);
    }
  }
  assert.deepStrictEqual([...missing], []);
});

test('t() interpolates and falls back', () => {
  setLang('en');
  assert.strictEqual(t('Quitar: {x}', { x: 'A' }), 'Remove: A');
  assert.strictEqual(t('texto sin traducir'), 'texto sin traducir');
  setLang('es');
  assert.strictEqual(t('Quitar: {x}', { x: 'A' }), 'Quitar: A');
});
