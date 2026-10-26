import type { ISandboxRuntimeProvider, SandboxRuntimeBinding } from '@xpert-ai/plugin-sdk'
import { SandboxRuntimeBindingSelector } from './sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'
import { LocalBrowserRuntimeProvider } from './local-browser-runtime.provider'

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

    it('selects only Providers that support read-only seekable file mappings when required', async () => {
        const materializing = provider('a-provider', [binding('materializing', 'a-provider', 0)])
        const seekable = provider('b-provider', [binding('seekable', 'b-provider', 1)])
        seekable.capabilities = { ...seekable.capabilities, readOnlyFileMounts: true }

        await expect(
            createSelector([materializing, seekable]).require(definition, undefined, { readOnlyFileMounts: true })
        ).resolves.toMatchObject({ provider: { type: 'b-provider' }, binding: { id: 'seekable' } })
    })

    it('skips legacy or incomplete control providers before health or create', async () => {
        const legacy = provider('legacy', [binding('legacy', 'legacy', 0)])
        const incomplete = provider('incomplete', [binding('incomplete', 'incomplete', 1)])
        incomplete.capabilities.executionControl = 1
        const controlled = provider('controlled', [binding('controlled', 'controlled', 2)])
        controlled.capabilities.executionControl = 1
        controlled.prepareControl = jest.fn()
        controlled.control = jest.fn()
        await expect(
            createSelector([legacy, incomplete, controlled]).require(definition, undefined, {
                executionControl: true
            })
        ).resolves.toMatchObject({ provider: { type: 'controlled' } })
        expect(legacy.getBindingHealth).not.toHaveBeenCalled()
        expect(incomplete.getBindingHealth).not.toHaveBeenCalled()
        await expect(createSelector([legacy]).inspect(definition, { executionControl: true })).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
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

    it('requires a read-only workspace for a regular binding that declares it', async () => {
        process.env.NODE_ENV = 'development'
        const compute = new SandboxRuntimeDefinitionRegistry().require('compute/node-python/v1')
        const localBinding = {
            ...binding('compute', 'compute-runtime', 0),
            runtimeProfile: compute.name
        }
        const runtime = provider('compute-runtime', [localBinding])
        await expect(createSelector([runtime]).inspect(compute)).resolves.toMatchObject({ available: false })
        runtime.capabilities = { ...runtime.capabilities, readOnlyWorkspace: true }
        await expect(createSelector([runtime]).require(compute)).resolves.toMatchObject({ binding: { id: 'compute' } })
    })

    it.each(['isolation', 'resourceLimits', 'networkPolicy', 'readOnlyRootFilesystem'] as const)(
        'requires a regular compute binding to satisfy its %s requirement',
        async (field) => {
            process.env.NODE_ENV = 'development'
            const compute = new SandboxRuntimeDefinitionRegistry().require('compute/node-python/v1')
            const runtime = provider('compute-runtime', [
                { ...binding('compute', 'compute-runtime', 0), runtimeProfile: compute.name }
            ])
            runtime.capabilities = {
                ...runtime.capabilities,
                readOnlyWorkspace: true,
                ...(field === 'isolation' ? { isolation: 'process' as const } : { [field]: false })
            }
            await expect(createSelector([runtime]).inspect(compute)).resolves.toMatchObject({ available: false })
        }
    )

    it('selects a compatible compute Provider in production only with an immutable artifact', async () => {
        process.env.NODE_ENV = 'production'
        const compute = new SandboxRuntimeDefinitionRegistry().require('compute/node-python/v1')
        const computeBinding = {
            ...binding('compute', 'compute-runtime', 0),
            runtimeProfile: compute.name,
            artifact: {
                kind: 'oci-image' as const,
                reference: `example/compute@sha256:${'a'.repeat(64)}`,
                digest: `sha256:${'a'.repeat(64)}`
            }
        }
        const runtime = provider('compute-runtime', [computeBinding])
        runtime.capabilities = { ...runtime.capabilities, readOnlyWorkspace: true }
        await expect(createSelector([runtime]).require(compute)).resolves.toMatchObject({ binding: { id: 'compute' } })
    })

    it('filters Providers that cannot guarantee the Definition security requirements', async () => {
        const unsafe = provider('process-provider', [binding('unsafe', 'process-provider', 0)])
        unsafe.capabilities = { ...unsafe.capabilities, isolation: 'process', readOnlyRootFilesystem: false }

        await expect(createSelector([unsafe]).inspect(definition)).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
    })

    it('allows an explicitly development-only process Binding during local development', async () => {
        process.env.NODE_ENV = 'development'
        const localBinding = { ...binding('local', 'local-browser-runtime', 10_000), developmentOnly: true as const }
        const local = provider('local-browser-runtime', [localBinding])
        local.capabilities = {
            isolation: 'process',
            ephemeral: true,
            resourceLimits: false,
            networkPolicy: false,
            readOnlyRootFilesystem: false
        }

        await expect(createSelector([local]).require(definition)).resolves.toMatchObject({
            provider: { type: 'local-browser-runtime' },
            binding: { id: 'local', developmentOnly: true }
        })
    })

    it.each(['document/libreoffice-v1', 'document/python-3.12/v1'])(
        'selects the built-in local binding for %s in development',
        async (profile) => {
            process.env.NODE_ENV = 'development'
            const runtime = new LocalBrowserRuntimeProvider()
            jest.spyOn(runtime, 'getBindingHealth').mockResolvedValue({ available: true })
            const document = new SandboxRuntimeDefinitionRegistry().require(profile)

            await expect(createSelector([runtime]).require(document)).resolves.toMatchObject({
                binding: { runtimeProfile: profile, developmentOnly: true }
            })
        }
    )

    it('applies the development fallback consistently to profiles with workspace requirements', async () => {
        process.env.NODE_ENV = 'development'
        const compute = new SandboxRuntimeDefinitionRegistry().require('compute/node-python/v1')
        const runtime = provider('development-runtime', [
            {
                ...binding('development', 'development-runtime', 10_000),
                runtimeProfile: compute.name,
                developmentOnly: true
            }
        ])
        runtime.capabilities = {
            isolation: 'process',
            ephemeral: true,
            resourceLimits: false,
            networkPolicy: false,
            readOnlyRootFilesystem: false
        }
        await expect(createSelector([runtime]).require(compute)).resolves.toMatchObject({
            binding: { id: 'development' }
        })
    })

    it('rejects a development-only Binding in production even when its Provider is present', async () => {
        process.env.NODE_ENV = 'production'
        const localBinding = { ...binding('local', 'local-browser-runtime', 0), developmentOnly: true as const }

        await expect(
            createSelector([provider('local-browser-runtime', [localBinding])]).inspect(definition)
        ).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
    })

    it('prefers a production-capable Binding over the local fallback in development', async () => {
        process.env.NODE_ENV = 'development'
        const docker = provider('docker-runtime', [binding('docker', 'docker-runtime', 100)])
        const localBinding = { ...binding('local', 'local-browser-runtime', 10_000), developmentOnly: true as const }

        await expect(
            createSelector([provider('local-browser-runtime', [localBinding]), docker]).require(definition)
        ).resolves.toMatchObject({ provider: { type: 'docker-runtime' }, binding: { id: 'docker' } })
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
