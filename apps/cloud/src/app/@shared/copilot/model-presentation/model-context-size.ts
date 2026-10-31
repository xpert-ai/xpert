/** Provider metadata can expose numeric token limits as JSON numbers or strings. */
export function modelContextSize(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : undefined
}
