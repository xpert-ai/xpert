/**
 * Checks if `value` is `null` or `undefined`.
 *
 * @category Lang
 * @param {*} value The value to check.
 * @returns {boolean} Returns `true` if `value` is nullish, else `false`.
 * @example
 *
 * isNil(null)
 * // => true
 *
 * isNil(void 0)
 * // => true
 *
 * isNil(NaN)
 * // => false
 */
export function isNil(value: unknown) {
  return value == null
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null
}