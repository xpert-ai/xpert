import type { ISandboxRuntimeProvider, SandboxRuntimeBinding } from '@xpert-ai/plugin-sdk'
import { SandboxRuntimeBindingSelector } from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

const definition = new SandboxRuntimeDefinitionRegistry().require('browser/playwright-1.61/v1')

describe('SandboxRuntimeBindingSelector', () => {
    const originalNodeEnv = process.env.NODE_ENV

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv
    })

    it('reports RUNTIME_UNBOUND when OSS Core has no Provider installed', async () => {
        const selector = createSelector([])

        await expect(selector.inspect(definition)).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
        await expect(selector.require(definition)).rejects.toMatchObject({
            code: 'SANDBOX_RUNTIME_UNAVAILABLE',
            retryable: false
        })
    })

    it('selects deterministically by priority, Provider type and Binding id', async () => {
        const slow = provider('z-provider', [binding('z-binding', 'z-provider', 20)])
        const preferred = provider('a-provider', [
            binding('b-binding', 'a-provider', 10),
            binding('a-binding', 'a-provider', 10)
        ])
        const selector = createSelector([slow, preferred])

        await expect(selector.require(definition)).resolves.toMatchObject({
            provider: { type: 'a-provider' },
            binding: { id: 'a-binding' }
        })
    })

    it('fails over to the next healthy compatible Binding', async () => {
        const first = provider('a-provider', [binding('first', 'a-provider', 0)], false)
        const second = provider('b-provider', [binding('second', 'b-provider', 1)])

        await expect(createSelector([first, second]).require(definition)).resolves.toMatchObject({
            provider: { type: 'b-provider' },
            binding: { id: 'second' }
        })
    })

    it('rejects mutable OCI references in production', async () => {
        process.env.NODE_ENV = 'production'
        const selector = createSelector([provider('docker-runtime', [binding('mutable', 'docker-runtime', 0)])])

        await expect(selector.inspect(definition)).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
    })

    it('filters Providers that cannot guarantee the Definition security requirements', async () => {
        const unsafe = provider('process-provider', [binding('unsafe', 'process-provider', 0)])
        unsafe.capabilities = { ...unsafe.capabilities, isolation: 'process', readOnlyRootFilesystem: false }

        await expect(createSelector([unsafe]).inspect(definition)).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
    })
})

function createSelector(providers: ISandboxRuntimeProvider[]) {
    return new SandboxRuntimeBindingSelector({ list: jest.fn().mockReturnValue(providers) } as never)
}

function binding(id: string, providerType: string, priority: number): SandboxRuntimeBinding {
    return {
        id,
        runtimeProfile: definition.name,
        provider: providerType,
        providerVersion: '1.0.0',
        priority,
        artifact: { kind: 'oci-image', reference: 'xpert-sandbox-browser:local' }
    }
}

function provider(
    type: string,
    bindings: SandboxRuntimeBinding[],
    healthy = true
): ISandboxRuntimeProvider & { capabilities: ISandboxRuntimeProvider['capabilities'] } {
    return {
        type,
        version: '1.0.0',
        capabilities: {
            isolation: 'hardened',
            ephemeral: true,
            resourceLimits: true,
            networkPolicy: true,
            readOnlyRootFilesystem: true
        },
        listBindings: jest.fn().mockResolvedValue(bindings),
        getBindingHealth: jest.fn().mockResolvedValue({ available: healthy, reason: healthy ? undefined : 'warming' }),
        create: jest.fn(),
        destroy: jest.fn()
    }
}
