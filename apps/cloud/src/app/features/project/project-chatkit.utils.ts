export function normalizeNonEmptyString(value?: string | null) {
  return value?.trim() || null
}
