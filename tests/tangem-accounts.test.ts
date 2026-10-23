import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XRP_PATH, xrpAccountPath } from '../src/signers/types';

test('la cuenta 1 de la app Tangem es la ruta XRP de siempre; las demás cambian el índice de cuenta', () => {
  assert.equal(xrpAccountPath(1), XRP_PATH);
  assert.equal(xrpAccountPath(2), "m/44'/144'/1'/0/0");
  assert.equal(xrpAccountPath(20), "m/44'/144'/19'/0/0");
});
