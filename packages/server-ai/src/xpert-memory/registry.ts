import { Injectable, Logger } from '@nestjs/common'
import { MemoryProvider } from './types'

export const MEMORY_REGISTRY_TOKEN = 'xpert.memory.registry'

@Injectable()
export class MemoryRegistry {
    private readonly logger = new Logger(MemoryRegistry.name)
    private readonly providers = new Map<string, MemoryProvider>()

    register(name: string, provider: MemoryProvider) {
        if (this.providers.has(name)) {
            this.logger.warn(`Memory provider "${name}" already registered. Overwriting existing provider.`)
        }
        this.providers.set(name, provider)
    }

    unregister(name: string) {
        this.providers.delete(name)
    }

    getProvider(name?: string): MemoryProvider | null {
        if (name) {
            return this.providers.get(name) ?? null
        }
        return this.providers.values().next().value ?? null
    }

    getProviderName(provider: MemoryProvider): string | null {
        for (const [name, registeredProvider] of this.providers.entries()) {
            if (registeredProvider === provider) {
                return name
            }
        }
        return null
    }

    getProviderOrThrow(name?: string): MemoryProvider {
        const provider = this.getProvider(name)
        if (!provider) {
            throw new Error(name ? `Memory provider "${name}" is not registered.` : 'No memory provider is registered.')
        }
        return provider
    }
}
