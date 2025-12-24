/**
 * Array deduplication function (High performance O(N) version).
 * @param arr The array to deduplicate.
 * @param iteratee The property name (string) or mapping function ((item) => key).
 */
export function uniqBy<T>(arr: T[], iteratee: string | ((item: T) => any)): T[] {
  const seen = new Set()

  return arr.filter((item) => {
    // Resolve the unique identifier (Key) for deduplication
    const key = typeof iteratee === 'string' ? (item as any)[iteratee] : iteratee(item)

    // If the Key has already been seen, filter it out; otherwise, add to Set and keep it
    if (seen.has(key)) {
      return false
    }
    seen.add(key)
    return true
  })
}
