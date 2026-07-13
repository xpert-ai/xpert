export type RuntimeCapabilityKey<T> = {
  readonly id: string
  readonly description?: string
  readonly __type?: T
}

export function createRuntimeCapability<T>(
  id: string,
  options: { description?: string } = {}
): RuntimeCapabilityKey<T> {
  return Object.freeze({
    id,
    description: options.description
  }) as RuntimeCapabilityKey<T>
}

export interface RuntimeCapabilityRegistry {
  register<T>(key: RuntimeCapabilityKey<T> | string, implementation: T): this

  has<T>(key: RuntimeCapabilityKey<T> | string): boolean

  get<T>(key: RuntimeCapabilityKey<T> | string): T | undefined

  require<T>(key: RuntimeCapabilityKey<T> | string): T
}

export const XPERT_RUNTIME_CAPABILITIES_TOKEN = 'XPERT_RUNTIME_CAPABILITIES'

export class DefaultRuntimeCapabilityRegistry implements RuntimeCapabilityRegistry {
  private readonly capabilities = new Map<string, unknown>()

  constructor(entries: Array<[RuntimeCapabilityKey<unknown> | string, unknown]> = []) {
    entries.forEach(([key, implementation]) => this.register(key, implementation))
  }

  register<T>(key: RuntimeCapabilityKey<T> | string, implementation: T): this {
    this.capabilities.set(runtimeCapabilityId(key), implementation)
    return this
  }

  has<T>(key: RuntimeCapabilityKey<T> | string): boolean {
    return this.capabilities.has(runtimeCapabilityId(key))
  }

  get<T>(key: RuntimeCapabilityKey<T> | string): T | undefined {
    return this.capabilities.get(runtimeCapabilityId(key)) as T | undefined
  }

  require<T>(key: RuntimeCapabilityKey<T> | string): T {
    const implementation = this.get(key)
    if (!implementation) {
      throw new Error(`Runtime capability '${runtimeCapabilityId(key)}' is not available`)
    }
    return implementation
  }
}

function runtimeCapabilityId(key: RuntimeCapabilityKey<unknown> | string) {
  return typeof key === 'string' ? key : key.id
}
