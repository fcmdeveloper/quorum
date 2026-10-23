import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XRP_PATH, xrpAccountPath } from '../src/signers/types';

test('la cuenta 1 de la app Tangem es la ruta XRP de siempre; las demás cambian el índice de cuenta', () => {
  assert.equal(xrpAccountPath(1), XRP_PATH);
  assert.equal(xrpAccountPath(2), "m/44'/144'/1'/0/0");
  assert.equal(xrpAccountPath(20), "m/44'/144'/19'/0/0");
});

import { LEDGER_XRP_PATH, ledgerAccountPath } from '../src/signers/types';
test('cuentas de Ledger Live: la 1 es la ruta de siempre; las demás cambian el índice de cuenta', () => {
  assert.equal(ledgerAccountPath(1), LEDGER_XRP_PATH);
  assert.equal(ledgerAccountPath(3), "44'/144'/2'/0/0");
});
