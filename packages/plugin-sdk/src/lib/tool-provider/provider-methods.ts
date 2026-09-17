/** Child overrides hide parent declarations, including undecorated overrides and accessors. */
export function collectProviderMethods(instance: object) {
  const methods: Array<{ methodName: string; method: object }> = []
  const seen = new Set<string>()
  let prototype: object | null = Object.getPrototypeOf(instance)
  while (prototype && prototype !== Object.prototype) {
    for (const methodName of Object.getOwnPropertyNames(prototype)) {
      if (methodName === 'constructor' || seen.has(methodName)) continue
      seen.add(methodName)
      const method: unknown = Object.getOwnPropertyDescriptor(prototype, methodName)?.value
      if (typeof method === 'function') methods.push({ methodName, method })
    }
    prototype = Object.getPrototypeOf(prototype)
  }
  return methods
}
