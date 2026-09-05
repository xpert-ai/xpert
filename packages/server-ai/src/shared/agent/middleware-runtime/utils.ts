export function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
