import { getConfig, setConfig } from '@xpert-ai/server-config'
import { AgentInvocationScope, AgentRuntimeDeploymentSpec, IAgentRuntimeStrategy } from '@xpert-ai/plugin-sdk'
import { RuntimeDeploymentsService } from './runtime-deployments.service'
import { mkdtemp, rm, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const profile = {
    reference: 'custom',
    title: 'Custom',
    toolName: 'delegate_custom',
    description: '',
    version: '1',
    environment: 'sdk' as const
}
const source = { kind: 'plugin' as const, scopeKey: 'org', pluginName: '@test/custom', pluginVersion: '1' }
const scope: AgentInvocationScope = {
    tenantId: 'tenant',
    organizationId: 'org',
    userId: 'first',
    workspaceId: 'workspace',
    conversationId: 'conversation',
    callerXpertId: 'assistant',
    callerAgentKey: 'agent',
    parentExecutionId: 'execution'
}
function strategy(spec: AgentRuntimeDeploymentSpec): IAgentRuntimeStrategy {
    return {
        capabilities: { background: true, recovery: 'none', interactions: false, cancellation: false },
        resolveManagedDeployment: async () => spec,
        start: jest.fn(),
        inspect: jest.fn()
    }
}

it('pins strategy settings and registration changes, and isolates actor directories without mutating plugin data', async () => {
    const original = getConfig()
    const root = await mkdtemp(join(tmpdir(), 'runtime-strategy-'))
    const service = new RuntimeDeploymentsService()
    const spec: AgentRuntimeDeploymentSpec = { type: 'sdk', environment: { KEY: 'first-secret' }, timeoutMs: 600000 }
    const adapter = strategy(spec)
    const resolve = () => service.resolve('any-plugin-provider', profile, adapter, source, scope)
    try {
        setConfig({ assetOptions: { ...original.assetOptions, dataPath: root } })
        const first = await resolve()
        if (first.type !== 'sdk') throw new Error('SDK deployment missing')
        first.environment.KEY = 'caller-mutation'
        expect(await resolve()).toMatchObject({ environment: { KEY: 'first-secret' } })
        const one = await service.prepare(first, scope)
        const two = await service.prepare(first, { ...scope, userId: 'second' })
        expect(one.workspaceRoot).not.toBe(two.workspaceRoot)
        expect(one.workspaceRoot.startsWith((await realpath(join(root, 'agent-runtimes'))) + '/')).toBe(true)
        spec.environment.KEY = 'rotated-secret'
        expect((await resolve()).revision).not.toBe(first.revision)
        const current = await resolve()
        expect(
            (
                await service.resolve(
                    'any-plugin-provider',
                    profile,
                    adapter,
                    { ...source, pluginName: '@another/plugin' },
                    scope
                )
            ).revision
        ).not.toBe(current.revision)
    } finally {
        setConfig(original)
        await rm(root, { recursive: true, force: true })
    }
})

it('rejects mismatched or malformed plugin output at the SDK boundary without exposing launch settings', async () => {
    const service = new RuntimeDeploymentsService()
    await expect(
        service.resolve(
            'custom',
            profile,
            strategy({ type: 'service', serverUrl: 'https://runtime.example/', timeoutMs: 600000 }),
            source,
            scope
        )
    ).rejects.toMatchObject({ code: 'ProviderUnavailable' })
    await expect(
        service.resolve(
            'custom',
            { ...profile, environment: 'service' },
            strategy({ type: 'service', serverUrl: 'file:///secret', timeoutMs: 600000 }),
            source,
            scope
        )
    ).rejects.toMatchObject({ code: 'ProviderUnavailable' })
})
