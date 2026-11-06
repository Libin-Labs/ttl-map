import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlMap } from '../dist/esm/index.js';
test('invalid clock adapters and async samples fail before any mutation', async () => {
  assert.throws(() => new TtlMap({ maxEntries: 1, clock: null }), TypeError);
  const c = new TtlMap({ maxEntries: 1, clock: () => Promise.reject(new Error('async')) });
  assert.throws(() => c.set('a', 1, 2), TypeError);
  const wrong = new TtlMap({ maxEntries: 1, clock: () => '0' });
  assert.throws(() => wrong.size, TypeError);
  await new Promise((resolve) => setImmediate(resolve));
});
test('deadline is exclusive and no timers are needed', () => {
  let now = 0;
  const c = new TtlMap({ maxEntries: 2, clock: () => now });
  c.set('a', 1, 5);
  now = 4;
  assert.equal(c.get('a'), 1);
  now = 5;
  assert.equal(c.get('a'), undefined);
  assert.equal(c.size, 0);
});
test('refresh on get uses original TTL, has does not refresh', () => {
  let now = 0;
  const c = new TtlMap({ maxEntries: 2, clock: () => now, refreshOnGet: true });
  c.set(1, 'a', 5);
  c.set(2, 'b', 5);
  now = 4;
  assert.equal(c.get(1), 'a');
  assert.equal(c.has(2), true);
  now = 5;
  assert.equal(c.has(2), false);
  assert.equal(c.has(1), true);
  now = 9;
  assert.equal(c.has(1), false);
});
test('updating deadlines repairs heap both directions without tombstones', () => {
  let now = 0;
  const c = new TtlMap({ maxEntries: 4, clock: () => now });
  c.set(1, 1, 4);
  c.set(2, 2, 8);
  c.set(3, 3, 12);
  c.set(1, 10, 20);
  c.set(3, 30, 2);
  now = 2;
  assert.equal(c.purge(), 1);
  assert.equal(c.delete(2), true);
  now = 19;
  assert.deepEqual(c.entries(), [[1, 10]]);
  now = 20;
  assert.equal(c.purge(), 1);
});
test('capacity purges first, rejects live overflow and validates exact limits', () => {
  let now = 0;
  const c = new TtlMap({ maxEntries: 1, clock: () => now });
  c.set(1, undefined, 1);
  assert.equal(c.has(1), true);
  assert.throws(() => c.set(2, 2, 1), /maxEntries/);
  assert.equal(c.size, 1);
  now = 1;
  c.set(2, 2, 1);
  assert.deepEqual(c.entries(), [[2, 2]]);
  for (const ttl of [0, -1, NaN, Infinity]) assert.throws(() => c.set(2, 3, ttl));
  assert.equal(c.get(2), 2);
  for (const maxEntries of [0, 0.5, Infinity])
    assert.throws(() => new TtlMap({ maxEntries, clock: () => 0 }));
});
test('clock failures and regressions do not expire or corrupt live entries', () => {
  let now = 10,
    fails = false;
  const c = new TtlMap({
    maxEntries: 2,
    clock: () => {
      if (fails) throw new Error('clock');
      return now;
    },
  });
  c.set('x', 1, 10);
  now = 9;
  assert.throws(() => c.clear(), /monotonic/);
  now = Infinity;
  assert.throws(() => c.size);
  now = 11;
  fails = true;
  assert.throws(() => c.delete('x'));
  fails = false;
  assert.equal(c.get('x'), 1);
  now = Number.MAX_VALUE;
  assert.throws(() => c.set('y', 2, Number.MAX_VALUE), /deadline/);
});
test('clock reentry is rejected and snapshots own containers', () => {
  let c;
  c = new TtlMap({
    maxEntries: 2,
    clock: () => {
      assert.throws(() => c.size, /Reentrant/);
      return 0;
    },
  });
  const value = {};
  c.set('x', value, 2);
  const rows = c.entries();
  rows[0][0] = 'bad';
  assert.equal(c.get('x'), value);
  assert.equal(c.delete('missing'), false);
  c.clear();
  assert.equal(c.size, 0);
});
test('seeded expiry heap agrees with scan-based Map oracle', () => {
  let seed = 349,
    now = 0;
  const random = () => {
    seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
    return seed >>> 8;
  };
  const c = new TtlMap({ maxEntries: 20, clock: () => now, refreshOnGet: true }),
    oracle = new Map();
  for (let i = 0; i < 1500; i++) {
    now += random() % 3;
    for (const [k, e] of oracle) if (e.end <= now) oracle.delete(k);
    const key = random() % 20,
      ttl = 1 + (random() % 15),
      op = random() % 4;
    if (op === 0) {
      c.set(key, i, ttl);
      oracle.set(key, { value: i, end: now + ttl, ttl });
    } else if (op === 1) {
      const e = oracle.get(key);
      assert.equal(c.get(key), e?.value);
      if (e) e.end = now + e.ttl;
    } else if (op === 2) assert.equal(c.delete(key), oracle.delete(key));
    else c.purge();
    assert.deepEqual(
      c.entries(),
      [...oracle].map(([k, e]) => [k, e.value]),
    );
  }
});
