# @lp-labs/ttl-map

An entry-bounded expiring Map with an indexed minimum-deadline heap and an injected clock.

## Install

```sh
npm install @lp-labs/ttl-map
```

Version 0.1.0. MIT. Zero runtime, peer, or sibling dependencies. Node >=18;
browser-compatible ES2022 runtime without browser-global reads. ESM and CommonJS
exports have separate matching declarations.

## Quick start

```js
import { TtlMap } from '@lp-labs/ttl-map';
let now = 0;
const cache = new TtlMap({ maxEntries: 2, clock: () => now, refreshOnGet: true });
cache.set('job', { ready: true }, 10);
now = 9;
if (!cache.get('job')?.ready) throw new Error('missing');
now = 19; // refresh at 9 extended the deadline to 19
if (cache.has('job')) throw new Error('expiry');
console.log(cache.size);
```

## Contract, customization, errors and ownership

Required `maxEntries` is a positive safe integer; required `clock()` returns a finite number in caller-chosen units. TTLs use those same units. `refreshOnGet` defaults false. No timers or Date/global-clock reads are used. Every public operation, including size/clear, samples the clock once, except set rejects a nonpositive/nonfinite TTL before sampling. Equal timestamps are accepted; a timestamp below the last accepted sample throws RangeError, rather than clamping. A successful sample advances the monotonic watermark even when a later validation/capacity error occurs. A throwing or reentrant clock callback changes no entries. Reentrant clock access throws Error.

`set(key, value, ttl)` requires positive finite TTL and a finite deadline strictly greater than now (including floating-point precision checks). It purges expired entries first and updates an existing key in place. A live-capacity overflow throws RangeError without inserting or evicting live entries; expiry purging may already have committed. Invalid deadlines are rejected before purging. There are no eviction callbacks. Clock adapters must be synchronous; nonfunctions, nonnumeric samples and thenable samples throw TypeError before purging (async rejections are observed). `get` optionally refreshes to now plus that entry's original TTL; overflow throws without changing that entry's deadline, after normal purge. `has`, `entries`, and size do not refresh.

Expiry is inclusive at the deadline: deadline <= now is absent. `purge` returns the number removed by that call. `delete` returns whether a live key was removed. `clear` removes all entries but does not reset the clock watermark. Missing get returns undefined; has distinguishes stored undefined. Entries preserve Map insertion order, with fresh tuples and shared key/value references.

The heap stores exactly one node per live entry, without tombstones: O(log n) insert/update/delete/refresh, expected O(1) non-refresh lookup plus O(k log n) expiration work per operation. Entries O(n + k log n); clear O(n); space O(maxEntries). Synchronous only; not a persistence or distributed-clock cache.

## Complete public declaration contract

Runtime exports and all exported types are listed below. Internal storage members
are omitted. Optional settings are constructor/function options, not globals.

```ts
export interface TtlOptions {
  maxEntries: number;
  clock: () => number;
  refreshOnGet?: boolean;
}
/** Indexed expiry heap: no stale tombstones or background timers. */
export declare class TtlMap<K, V> {
  constructor(options: TtlOptions);
  get size(): number;
  purge(): number;
  set(key: K, value: V, ttl: number): void;
  get(key: K): V | undefined;
  has(key: K): boolean;
  delete(key: K): boolean;
  clear(): void;
  entries(): [K, V][];
}
```

## Development

```sh
npm ci --offline
npm run build
npm run typecheck
npm test
npm run format:check
```

TypeScript ^5.9.3 and Prettier ^3.6.2 are development-only. Offline installation
requires their locked packages already in the local npm cache. Build emits
dist/esm and dist/cjs with separate declarations; tests exercise runtime behavior
and bare-package ESM/CommonJS type consumers with negative checks. No publish
step is needed to build or test.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
