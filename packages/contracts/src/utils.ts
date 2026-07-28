export function isNil(value: unknown): value is null | undefined {
  return value == null
}

export function nonNullable<T>(value: T): value is NonNullable<T> {
  return value != null
}

export function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String
}

export function isBlank(value: unknown): boolean {
  return isNil(value) || (isString(value) && !value.trim())
}

export function nonBlank<T>(value: T): value is NonNullable<T> {
  return !isBlank(value)
}
