import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

// La navegación solo monta la pantalla de arriba: una pantalla "scan" aparte desmonta el
// formulario que la abrió, y la dirección escaneada se pierde. Los formularios usan
// useAddressScanner (ventana sobre la pantalla actual).
test('address scanning never goes through the scan route', () => {
  const offenders = files('src').filter((f) => {
    const s = readFileSync(f, 'utf8');
    return /push\(\s*'scan'[\s\S]{0,80}(purpose:\s*'address'|onAddress)/.test(s) || /replace\(\s*'scan'[\s\S]{0,80}onAddress/.test(s);
  });
  assert.deepStrictEqual(offenders, []);
});

test('every screen that opens the address scanner renders its modal', () => {
  for (const f of files('src/screens')) {
    const s = readFileSync(f, 'utf8');
    if (!s.includes('scanner.open(')) continue;
    assert.ok(s.includes('{scanner.modal}'), `${f} opens the scanner but never renders scanner.modal`);
  }
});
