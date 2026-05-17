export function compactObject<T extends object>(value: T): T {
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      continue
    }
    if (value[key] === undefined || value[key] === null) {
      delete value[key]
    }
  }

  return value
}

export function nonEmptyArray<T>(value: T[] | undefined): T[] | undefined {
  return value?.length ? value : undefined
}
