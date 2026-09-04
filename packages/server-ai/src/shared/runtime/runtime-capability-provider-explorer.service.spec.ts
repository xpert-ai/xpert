import { Reflector } from '@nestjs/core'
import { createRuntimeCapability, DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { RuntimeCapabilityProvider } from './runtime-capability-provider.decorator'
import { RuntimeCapabilityProviderExplorer } from './runtime-capability-provider-explorer.service'

const TestRuntimeCapability = createRuntimeCapability<{ execute(): string }>('test.runtime')

@RuntimeCapabilityProvider(TestRuntimeCapability)
class TestRuntimeCapabilityProvider {
    execute() {
        return 'ok'
    }
}

describe('RuntimeCapabilityProviderExplorer', () => {
    it('registers decorated providers and ignores other Nest providers', () => {
        const provider = new TestRuntimeCapabilityProvider()
        const registry = new DefaultRuntimeCapabilityRegistry()
        const discovery = {
            getProviders: jest.fn(() => [{ instance: provider }, { instance: {} }, { instance: null }])
        }
        const explorer = new RuntimeCapabilityProviderExplorer(discovery as never, new Reflector(), registry)

        explorer.onModuleInit()

        expect(registry.require(TestRuntimeCapability)).toBe(provider)
    })

    it('rejects duplicate providers for the same capability', () => {
        const registry = new DefaultRuntimeCapabilityRegistry().register(TestRuntimeCapability, {
            execute: () => 'existing'
        })
        const discovery = { getProviders: jest.fn(() => [{ instance: new TestRuntimeCapabilityProvider() }]) }
        const explorer = new RuntimeCapabilityProviderExplorer(discovery as never, new Reflector(), registry)

        expect(() => explorer.onModuleInit()).toThrow(
            "Runtime capability 'test.runtime' has more than one platform provider"
        )
    })

    it('treats repeated Nest wrappers for the same provider type as idempotent', () => {
        const first = new TestRuntimeCapabilityProvider()
        const registry = new DefaultRuntimeCapabilityRegistry()
        const discovery = {
            getProviders: jest.fn(() => [{ instance: first }, { instance: new TestRuntimeCapabilityProvider() }])
        }
        const explorer = new RuntimeCapabilityProviderExplorer(discovery as never, new Reflector(), registry)

        explorer.onModuleInit()

        expect(registry.require(TestRuntimeCapability)).toBe(first)
    })
})
