/**
 * Array deduplication function (High performance O(N) version).
 * @param arr The array to deduplicate.
 * @param iteratee The property name (keyof T) or mapping function ((item) => key).
 */
type KeyFn<T, K> = (item: T) => K;

export function uniqBy<T, K>(
  arr: readonly T[],
  iteratee: keyof T | KeyFn<T, K>
): T[] {
  const getKey: KeyFn<T, K | T[keyof T]> =
    typeof iteratee === 'function'
      ? iteratee
      : (item) => item[iteratee];

  const seen = new Set<K | T[keyof T]>();
  const out: T[] = [];

  for (const item of arr) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}
