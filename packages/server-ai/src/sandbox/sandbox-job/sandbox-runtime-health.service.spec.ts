import { SandboxRuntimeHealthService } from './sandbox-runtime-health.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

const definition = new SandboxRuntimeDefinitionRegistry().require('browser/playwright-1.61/v1')

describe('SandboxRuntimeHealthService API heartbeat view', () => {
    const originalNodeEnv = process.env.NODE_ENV
    const originalRole = process.env.XPERT_PROCESS_ROLE

    beforeEach(() => {
        process.env.NODE_ENV = 'production'
        delete process.env.XPERT_PROCESS_ROLE
    })

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv
        if (originalRole === undefined) delete process.env.XPERT_PROCESS_ROLE
        else process.env.XPERT_PROCESS_ROLE = originalRole
    })

    it('reports PROVIDER_UNAVAILABLE when no worker heartbeat exists', async () => {
        const service = createService([])

        await expect(service.getProfileHealth(definition)).resolves.toMatchObject({
            available: false,
            reason: 'PROVIDER_UNAVAILABLE'
        })
    })

    it('does not probe Providers from a development API process', async () => {
        process.env.NODE_ENV = 'development'
        delete process.env.XPERT_PROCESS_ROLE
        const redis = { eval: jest.fn().mockResolvedValue([]) }
        const selector = { inspect: jest.fn() }
        const service = new SandboxRuntimeHealthService(
            { getRedis: jest.fn().mockResolvedValue(redis) } as never,
            new SandboxRuntimeDefinitionRegistry(),
            selector as never
        )

        await expect(service.getProfileHealth(definition)).resolves.toMatchObject({
            available: false,
            reason: 'PROVIDER_UNAVAILABLE'
        })
        expect(selector.inspect).not.toHaveBeenCalled()
    })

    it('ignores expired heartbeats and preserves a live worker RUNTIME_UNBOUND warning', async () => {
        const expired = record({ reason: 'PROFILE_UNHEALTHY', expiresAt: Date.now() - 1 })
        await expect(
            createService(['old-worker', JSON.stringify(expired)]).getProfileHealth(definition)
        ).resolves.toMatchObject({
            reason: 'PROVIDER_UNAVAILABLE'
        })

        const unbound = record({ reason: 'RUNTIME_UNBOUND', expiresAt: Date.now() + 30_000 })
        await expect(
            createService(['worker', JSON.stringify(unbound)]).getProfileHealth(definition)
        ).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND',
            workerId: 'worker-1'
        })
    })
})

function createService(hash: unknown[]) {
    const redis = { eval: jest.fn().mockResolvedValue(hash) }
    return new SandboxRuntimeHealthService(
        { getRedis: jest.fn().mockResolvedValue(redis) } as never,
        new SandboxRuntimeDefinitionRegistry(),
        { inspect: jest.fn() } as never
    )
}

function record(overrides: Partial<Record<string, unknown>>) {
    return {
        workerId: 'worker-1',
        runtimeProfile: definition.name,
        sandboxRuntimeVersion: definition.sandboxRuntimeVersion,
        available: false,
        checkedAt: Date.now(),
        expiresAt: Date.now() + 30_000,
        ...overrides
    }
}
