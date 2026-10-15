import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// El bloqueo con Face ID va como capa encima de la app. Si reemplaza el árbol (un `return`
// temprano), al volver a la app se pierde lo que estabas haciendo (p. ej. los firmantes elegidos).
test('the app lock is an overlay, never a replacement of the app tree', () => {
  const app = readFileSync('App.tsx', 'utf8');
  assert.ok(!/if\s*\(\s*lock\.locked\s*\)\s*return/.test(app), 'App.tsx returns early when locked');
  assert.ok(/<Modal[^>]*visible=\{lock\.locked\}/.test(app), 'lock layer Modal not found');
  assert.ok((app.match(/\{lockLayer\}/g) ?? []).length >= 3, 'every post-onboarding view must render the lock layer');
});
