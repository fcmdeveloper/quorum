import { test } from 'node:test';
import assert from 'node:assert';
import { balanceFiatDecimals, formatBalanceXrp } from '../src/core/market';

const digits = (s: string) => s.replace(/[^0-9]/g, '');

test('saldos con decimales elegidos: se truncan, nunca se muestra de más', () => {
  assert.strictEqual(digits(formatBalanceXrp(1.239999, '2')), '123');
  assert.strictEqual(digits(formatBalanceXrp(10, '4')), '100000');
  assert.strictEqual(digits(formatBalanceXrp(99.99, '0')), '99');
  assert.strictEqual(digits(formatBalanceXrp(0.29, '2')), '029');
  assert.strictEqual(digits(formatBalanceXrp('12.5', 'auto')), '125');
  assert.strictEqual(balanceFiatDecimals('0'), 0);
  assert.strictEqual(balanceFiatDecimals('4'), undefined);
});
