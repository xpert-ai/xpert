import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { SandboxRuntimeProviderRegistry, StrategyBus, type SandboxRuntimeCreateOptions } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SandboxRuntimeBindingSelector } from '../../sandbox-job/sandbox-runtime-binding-selector.service'
import { SandboxRuntimeDefinitionRegistry } from '../../sandbox-job/sandbox-runtime-definition.registry'
import { NsjailComputeRuntimeProvider } from './nsjail-compute-runtime.provider'

const definitions = new SandboxRuntimeDefinitionRegistry()
const definition = definitions.require('compute/node-python/v1')
const success = { output: '完成\n', exitCode: 0, timedOut: false, truncated: false }

describe('NsjailComputeRuntimeProvider', () => {
    const fetchSpy = jest.spyOn(global, 'fetch')
    const original = {
        url: process.env.NSJAIL_RUNNER_URL,
        token: process.env.NSJAIL_RUNNER_TOKEN,
        mode: process.env.NODE_ENV
    }
    let provider: NsjailComputeRuntimeProvider

    beforeEach(() => {
        process.env.NSJAIL_RUNNER_URL = 'http://runner:8090'
        process.env.NSJAIL_RUNNER_TOKEN = 'test-secret'
        process.env.NODE_ENV = 'production'
        provider = new NsjailComputeRuntimeProvider(definitions)
        fetchSpy.mockReset()
        fetchSpy.mockImplementation(async (url, init) => {
            if (String(url).endsWith('/jobs') && typeof init?.body === 'string') {
                const body = z.object({ runtimeId: z.string() }).parse(JSON.parse(init.body))
                return new Response(JSON.stringify({ runtimeId: body.runtimeId }))
            }
            return new Response('{}')
        })
    })

    afterAll(() => {
        fetchSpy.mockRestore()
        for (const [key, value] of Object.entries({
            NSJAIL_RUNNER_URL: original.url,
            NSJAIL_RUNNER_TOKEN: original.token,
            NODE_ENV: original.mode
        })) {
            if (value === undefined) delete process.env[key]
            else process.env[key] = value
        }
    })

    function options(): SandboxRuntimeCreateOptions {
        return {
            tenantId: 'tenant-a',
            workFor: { type: 'job', id: 'job-a' },
            definition,
            binding: provider.listBindings()[0],
            volume: { serverRoot: '/api/private/job', hostRoot: '/host/private/job' },
            ephemeral: true,
            resources: definition.resources,
            networkPolicy: definition.networkPolicy,
            security: definition.security,
            hardDeadlineMs: definition.hardDeadlineMs
        }
    }

    const command = [
        ...definition.command,
        '--request',
        '/workspace/input/job.json',
        '--output',
        '/workspace/output',
        '--action-root',
        '/workspace/runtime/action',
        '--action-manifest',
        '/workspace/runtime/action-manifest.json'
    ]

    it('is lazy and absent when unconfigured', () => {
        delete process.env.NSJAIL_RUNNER_URL
        expect(provider.listBindings()).toEqual([])
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('registers and selects the built-in hardened provider in production', async () => {
        fetchSpy.mockResolvedValue(
            new Response(
                JSON.stringify({
                    protocolVersion: 1,
                    available: true,
                    manifest: definition.expectedManifest,
                    definition
                })
            )
        )
        const module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [
                StrategyBus,
                SandboxRuntimeDefinitionRegistry,
                NsjailComputeRuntimeProvider,
                SandboxRuntimeProviderRegistry,
                SandboxRuntimeBindingSelector
            ]
        }).compile()
        await module.init()
        try {
            await expect(module.get(SandboxRuntimeBindingSelector).require(definition)).resolves.toMatchObject({
                provider: { type: 'nsjail-compute' },
                binding: { artifact: { kind: 'remote-runtime' } }
            })
            await expect(
                module.get(SandboxRuntimeBindingSelector).inspect(definition, { readOnlyFileMounts: true })
            ).resolves.toMatchObject({
                available: false,
                reason: 'RUNTIME_UNBOUND'
            })
        } finally {
            await module.close()
        }
    })

    it.each(['protocol', 'manifest', 'definition', 'unavailable', 'legacy'])(
        'rejects %s health without leaking diagnostics',
        async (failure) => {
            const health = {
                protocolVersion: 1,
                available: true,
                manifest: { ...definition.expectedManifest },
                definition: structuredClone(definition)
            }
            if (failure === 'protocol') health.protocolVersion = 0
            if (failure === 'manifest') health.manifest.runnerHostSha256 = 'wrong'
            if (failure === 'definition') health.definition.resources.memoryMb = 9999
            if (failure === 'unavailable') health.available = false
            fetchSpy.mockResolvedValue(
                new Response(JSON.stringify(failure === 'legacy' ? { error: 'private secret path' } : health), {
                    status: failure === 'legacy' ? 404 : 200
                })
            )
            const result = await provider.getBindingHealth({ definition, binding: options().binding })
            expect(result.available).toBe(false)
            expect(result.reason).not.toContain('secret')
        }
    )

    it('uses tenant-scoped IDs and sends no volume paths or interactive command', async () => {
        const first = await provider.create(options())
        const second = await provider.create({ ...options(), tenantId: 'tenant-b' })
        expect(first.id).toMatch(/^[a-f0-9]{64}$/)
        expect(first.id).not.toBe(second.id)
        for (const [, init] of fetchSpy.mock.calls) {
            expect(init.body).not.toContain('/api/private')
            expect(init.body).not.toContain('/host/private')
            expect(init.redirect).toBe('error')
        }
    })

    it.each(['resources', 'security', 'network', 'deadline', 'binding', 'definition', 'seekable'])(
        'rejects an unsupported %s policy before RPC',
        async (policy) => {
            const input = structuredClone(options())
            if (policy === 'resources') input.resources.memoryMb++
            if (policy === 'security') input.security.noNewPrivileges = false
            if (policy === 'network') input.networkPolicy.mode = 'internal-only'
            if (policy === 'deadline') input.hardDeadlineMs++
            if (policy === 'binding') input.binding.artifact.reference = 'untrusted'
            if (policy === 'definition') input.definition.command = ['/bin/bash']
            if (policy === 'seekable')
                input.readOnlyFiles = [
                    {
                        targetPath: 'input/a',
                        size: 1,
                        sha256: 'x',
                        source: {
                            serverPath: '/private',
                            hostPath: '/private',
                            size: 1,
                            mtimeMs: 1,
                            device: 1,
                            inode: 1
                        }
                    }
                ]
            await expect(provider.create(input)).rejects.toThrow()
            expect(fetchSpy).not.toHaveBeenCalled()
        }
    )

    it('allows only the exact trusted argv and bounded execution options', async () => {
        const runtime = await provider.create(options())
        fetchSpy.mockClear()
        expect(() => runtime.execute(['/bin/bash', '-c', 'id'])).toThrow()
        expect(() => runtime.execute([...command, '--manifest'])).toThrow()
        expect(() => runtime.execute(command, { timeoutMs: 30001 })).toThrow()
        expect(() => runtime.execute(command, { maxOutputBytes: -1 })).toThrow()
        expect(fetchSpy).not.toHaveBeenCalled()
    })

    it('streams UTF-8 output while preserving normalized execution results and observer isolation', async () => {
        const runtime = await provider.create(options())
        const bytes = new TextEncoder().encode(
            JSON.stringify({ type: 'output', text: success.output }) +
                '\n' +
                JSON.stringify({ type: 'result', result: success }) +
                '\n'
        )
        fetchSpy.mockResolvedValue(
            new Response(
                new ReadableStream({
                    start(controller) {
                        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
                        controller.close()
                    }
                })
            )
        )
        const onOutput = jest.fn(() => {
            throw new Error('observer failed')
        })
        await expect(runtime.execute(command, { onOutput })).resolves.toEqual(success)
        expect(onOutput).toHaveBeenCalledWith({ stream: 'stdout', text: success.output })
        expect(fetchSpy.mock.calls.at(-1)[1].body).toBe(JSON.stringify({ timeoutMs: 25000, maxOutputBytes: 4194304 }))
    })

    it.each(['oom', 'cancelled', 'deadline'] as const)('preserves the %s termination reason', async (reason) => {
        const runtime = await provider.create(options())
        const result = { ...success, exitCode: 137, terminationReason: reason, timedOut: reason === 'deadline' }
        fetchSpy.mockResolvedValue(new Response(JSON.stringify({ type: 'result', result }) + '\n'))
        await expect(runtime.execute(command)).resolves.toEqual(result)
    })

    it('terminates a job when the stream ends without a result', async () => {
        const runtime = await provider.create(options())
        fetchSpy
            .mockResolvedValueOnce(new Response('{"type":"output","text":"partial"}\n'))
            .mockResolvedValueOnce(new Response('{}'))
        await expect(runtime.execute(command)).rejects.toMatchObject({ code: 'SANDBOX_START_FAILED' })
        expect(fetchSpy).toHaveBeenLastCalledWith(expect.stringContaining('/terminate'), expect.anything())
    })

    it('destroys after provider reload and rejects forged cross-tenant runtime evidence', async () => {
        const input = options()
        const runtime = await provider.create(input)
        const cleanup = {
            tenantId: input.tenantId,
            workFor: input.workFor,
            runtimeProfile: definition.name,
            runtimeBindingId: input.binding.id,
            artifact: input.binding.artifact,
            runtimeRef: runtime.id
        }
        await new NsjailComputeRuntimeProvider(definitions).destroy(cleanup)
        expect(fetchSpy).toHaveBeenLastCalledWith(
            expect.stringContaining(`/jobs/${runtime.id}`),
            expect.objectContaining({ method: 'DELETE' })
        )
        fetchSpy.mockClear()
        await expect(provider.destroy({ ...cleanup, tenantId: 'tenant-b' })).rejects.toThrow()
        expect(fetchSpy).not.toHaveBeenCalled()
    })
})
