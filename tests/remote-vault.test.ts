import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';

// El teléfono que firma por QR normalmente no tiene la bóveda agregada. Sin leer sus firmantes
// del ledger, la operación aparece como "0/0" y sin botones para firmar.
test('a proposal from a vault not on this phone reads its signer list from the ledger', () => {
  const state = readFileSync('src/state.tsx', 'utf8');
  assert.match(state, /if \(acc\) await refreshAccount\(acc\);\s*else await loadRemoteState\(d\.network, d\.tx\.Account\);/);
  const screen = readFileSync('src/screens/ProposalScreen.tsx', 'utf8');
  assert.match(screen, /app\.stateAt\(p\.network, p\.account\)/);
  assert.match(screen, /app\.loadRemoteState\(p\.network, p\.account\)/);
  const list = readFileSync('src/screens/ProposalsScreen.tsx', 'utf8');
  assert.match(list, /app\.stateAt\(p\.network, p\.account\)/);
});
