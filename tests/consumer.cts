import { TtlMap, type TtlOptions } from '@lp-labs/ttl-map';
const options: TtlOptions = { maxEntries: 2, clock: () => 0 };
const cache = new TtlMap<string, number>(options);
cache.set('a', 1, 5);
const rows: [string, number][] = cache.entries();
// @ts-expect-error numeric TTL required
cache.set('b', 1, '5');
// @ts-expect-error key must be string
cache.get(1);
void rows;
