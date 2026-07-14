import { SandboxRuntimeHealthService } from './sandbox-runtime-health.service'
import { SandboxRuntimeDefinitionRegistry } from './sandbox-runtime-definition.registry'

const definition = new SandboxRuntimeDefinitionRegistry().require('browser/playwright-1.61/v1')

describe('SandboxRuntimeHealthService API Runtime executor', () => {
    it('probes and publishes an unbound Runtime warning from the API process', async () => {
        const { service, selector, redis } = createService({
            available: false,
            reason: 'RUNTIME_UNBOUND',
            message: 'No compatible Runtime binding is registered.'
        })

        await expect(service.getProfileHealth(definition)).resolves.toMatchObject({
            available: false,
            reason: 'RUNTIME_UNBOUND'
        })
        expect(selector.inspect).toHaveBeenCalledWith(definition)
        expect(redis.eval).toHaveBeenCalled()
    })

    it('returns provider evidence and caches the short-lived local probe', async () => {
        const digest = `sha256:${'a'.repeat(64)}`
        const { service, selector, redis } = createService({
            available: true,
            resolution: {
                provider: { type: 'docker-runtime' },
                binding: {
                    id: 'docker-browser-v1',
                    artifact: {
                        kind: 'oci-image',
                        reference: `ghcr.io/xpert-ai/xpert-sandbox-browser@${digest}`,
                        digest
                    }
                },
                manifest: { contractVersion: '1' }
            }
        })

        await expect(service.getProfileHealth(definition)).resolves.toMatchObject({
            available: true,
            provider: 'docker-runtime',
            runtimeBindingId: 'docker-browser-v1',
            artifactDigest: digest
        })
        await service.getProfileHealth(definition)

        expect(selector.inspect).toHaveBeenCalledTimes(1)
        expect(redis.eval).toHaveBeenCalledTimes(1)
    })
})

function createService(health: Record<string, unknown>) {
    const redis = { eval: jest.fn().mockResolvedValue(1) }
    const selector = { inspect: jest.fn().mockResolvedValue(health) }
    return {
        redis,
        selector,
        service: new SandboxRuntimeHealthService(
            { getRedis: jest.fn().mockResolvedValue(redis) } as never,
            new SandboxRuntimeDefinitionRegistry(),
            selector as never
        )
    }
}
