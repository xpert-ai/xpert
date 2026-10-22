import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SandboxRuntimeProviderRegistry, StrategyBus, type SandboxRuntimeCreateOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SandboxRuntimeBindingSelector } from '../sandbox-job/sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from '../sandbox-job/sandbox-runtime-definition.registry'
import { NsjailDocumentRuntimeProvider } from './nsjail-document-runtime.provider'

describe('NsJail managed document profiles', () => {
    const previous = {
        url: process.env.NSJAIL_RUNNER_URL,
        token: process.env.NSJAIL_RUNNER_TOKEN,
        mode: process.env.NODE_ENV
    }
    const definitions = new SandboxRuntimeDefinitionRegistry()
    const fetchSpy = jest.spyOn(global, 'fetch')
    let provider: NsjailDocumentRuntimeProvider

    beforeEach(() => {
        process.env.NODE_ENV = 'production'
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'private-control-token'
        provider = new NsjailDocumentRuntimeProvider(definitions)
        fetchSpy.mockReset()
        fetchSpy.mockImplementation(async (_url, init) => {
            const body = z.object({ runtimeId: z.string() }).parse(JSON.parse(String(init?.body)))
            return new Response(JSON.stringify({ runtimeId: body.runtimeId }))
        })
    })

    afterAll(() => {
        fetchSpy.mockRestore()
        for (const [name, value] of Object.entries({
            NODE_ENV: previous.mode,
            NSJAIL_RUNNER_URL: previous.url,
            NSJAIL_RUNNER_TOKEN: previous.token
        })) {
            if (value === undefined) delete process.env[name]
            else process.env[name] = value
        }
    })

    function options(profile: string): SandboxRuntimeCreateOptions {
        const definition = definitions.require(profile)
        const binding = provider.listBindings().find((binding) => binding.runtimeProfile === profile)
        if (!binding) throw new Error('Missing test binding')
        return {
            tenantId: 'tenant',
            workFor: { type: 'job', id: 'job' },
            definition,
            binding,
            volume: { serverRoot: '/private/api', hostRoot: '/private/host' },
            ephemeral: true,
            resources: definition.resources,
            security: definition.security,
            networkPolicy: definition.networkPolicy,
            hardDeadlineMs: definition.hardDeadlineMs
        }
    }

    it('is absent when no Runner is configured', () => {
        delete process.env.NSJAIL_RUNNER_URL
        expect(provider.listBindings()).toEqual([])
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('registers both hardened document profiles in production', async () => {
        fetchSpy.mockImplementation(async (url) => {
            const profile = String(url).endsWith('/node/health') ? 'document/node-20/v1' : 'document/java-17/v1'
            const definition = definitions.require(profile)
            return new Response(
                JSON.stringify({
                    protocolVersion: 1,
                    available: true,
                    manifest: definition.expectedManifest,
                    definition
                })
            )
        })
        const module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [
                StrategyBus,
                SandboxRuntimeDefinitionRegistry,
                NsjailDocumentRuntimeProvider,
                SandboxRuntimeProviderRegistry,
                SandboxRuntimeBindingSelector
            ]
        }).compile()
        await module.init()
        try {
            for (const binding of provider.listBindings()) {
                const definition = definitions.require(binding.runtimeProfile)
                await expect(module.get(SandboxRuntimeBindingSelector).require(definition)).resolves.toMatchObject({
                    provider: { type: 'nsjail-document' },
                    binding: { id: binding.id, artifact: { kind: 'remote-runtime' } }
                })
            }
        } finally {
            await module.close()
        }
    })

    it.each([
        ['document/node-20/v1', 'node'],
        ['document/java-17/v1', 'java']
    ])('%s uses only its fixed RPC and policy', async (profile, route) => {
        const input = options(profile)
        await provider.create(input)
        expect(fetchSpy).toHaveBeenCalledWith(
            `http://runner:8090/v1/document/${route}/jobs`,
            expect.objectContaining({
                body: expect.not.stringContaining('/private/')
            })
        )
        fetchSpy.mockClear()
        const wrong = provider.listBindings().find((binding) => binding.runtimeProfile !== profile)
        if (!wrong) throw new Error('Missing second test binding')
        await expect(provider.create({ ...input, binding: wrong })).rejects.toThrow()
        await expect(provider.create({ ...input, resources: { ...input.resources, memoryMb: 256 } })).rejects.toThrow()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it.each(['document/node-20/v1', 'document/java-17/v1'])(
        '%s fails closed on old Runner or dependency drift',
        async (profile) => {
            const input = options(profile)
            fetchSpy.mockResolvedValue(new Response('private runner details', { status: 404 }))
            expect(await provider.getBindingHealth(input)).toMatchObject({ available: false })
            fetchSpy.mockResolvedValue(
                new Response(
                    JSON.stringify({
                        protocolVersion: 1,
                        available: true,
                        definition: input.definition,
                        manifest: { ...input.definition.expectedManifest, dependenciesSha256: 'wrong' }
                    })
                )
            )
            const health = await provider.getBindingHealth(input)
            expect(health.available).toBe(false)
            expect(JSON.stringify(health)).not.toContain('private runner details')
        }
    )

    it('isolates the same tenant/job identity across the two document profiles', async () => {
        const node = await provider.create(options('document/node-20/v1'))
        const java = await provider.create(options('document/java-17/v1'))
        expect(node.id).not.toBe(java.id)
        const input = options('document/node-20/v1')
        fetchSpy.mockClear()
        await expect(
            provider.destroy({
                tenantId: input.tenantId,
                workFor: input.workFor,
                runtimeProfile: input.definition.name,
                runtimeBindingId: input.binding.id,
                artifact: input.binding.artifact,
                runtimeRef: java.id
            })
        ).rejects.toThrow()
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
