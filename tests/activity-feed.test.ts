import { test } from 'node:test';
import assert from 'node:assert';
import { FeedSource, hasMore, mergeFeed, periodStart, sourcesToLoad } from '../src/core/activityFeed';

const it = (hash: string, date: number) => ({ hash, date, kind: 'in', title: '', success: true }) as any;

test('no muestra lo que podría tener huecos', () => {
  // A tiene más páginas y su último cargado es del día 50; B ya terminó con movimientos más viejos
  const A: FeedSource = { key: 'A', items: [it('a1', 100), it('a2', 50)], marker: 'm', done: false };
  const B: FeedSource = { key: 'B', items: [it('b1', 80), it('b2', 10)], done: true };
  assert.deepStrictEqual(mergeFeed([A, B], null).map((x) => x.hash), ['a1', 'b1', 'a2']);
  // cuando A termina, aparece todo
  assert.deepStrictEqual(mergeFeed([{ ...A, done: true }, B], null).map((x) => x.hash), ['a1', 'b1', 'a2', 'b2']);
});

test('un pago entre cuentas propias aparece una vez', () => {
  const A: FeedSource = { key: 'A', items: [it('x', 100)], done: true };
  const B: FeedSource = { key: 'B', items: [it('x', 100)], done: true };
  assert.strictEqual(mergeFeed([A, B], null).length, 1);
});

test('período y qué cuentas hay que seguir pidiendo', () => {
  const now = Date.UTC(2026, 9, 15);
  const from = periodStart('7d', now)!;
  assert.strictEqual(from, now - 7 * 864e5);
  assert.strictEqual(periodStart('all', now), null);
  const A: FeedSource = { key: 'A', items: [it('a', now - 864e5)], marker: 'm', done: false };
  const B: FeedSource = { key: 'B', items: [it('b', now - 20 * 864e5)], marker: 'm', done: false };
  assert.deepStrictEqual(sourcesToLoad([A, B], from).map((s) => s.key), ['A']);
  // "cargar más": solo la que marca la frontera
  assert.deepStrictEqual(sourcesToLoad([A, B], null).map((s) => s.key), ['A']);
  assert.ok(!hasMore([{ ...A, done: true }, { ...B, done: true }], null));
  assert.deepStrictEqual(mergeFeed([A, B], from).map((x) => x.hash), ['a']);
});
