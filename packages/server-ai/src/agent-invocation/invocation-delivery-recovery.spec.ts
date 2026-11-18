jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { createHash } from 'node:crypto'
import { DiscoveryService, Reflector } from '@nestjs/core'
import {
    AgentExecutionRunnerCapability,
    AgentRuntimeRegistry,
    DefaultRuntimeCapabilityRegistry,
    BUILTIN_GLOBAL_SCOPE,
    type AgentInvocation,
    type AgentExecutionRunner,
    type IAgentRuntimeStrategy
} from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'

async function fixture() {
    const store = new MemoryInvocationStore()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    const strategy: IAgentRuntimeStrategy = {
        capabilities: { recovery: 'session', background: true, interactions: false, cancellation: false },
        start: jest.fn(async () => {
            throw Error('Recovery must never start a process')
        }),
        inspect: jest.fn(async () => ({ status: 'succeeded' as const }))
    }
    registry.register('test', strategy, { kind: 'builtin', scopeKey: BUILTIN_GLOBAL_SCOPE })
    const text = '# Review\nDeployment was not tested.\n```json\n{"example":true}\n```'
    const report = { text, sha256: createHash('sha256').update(text).digest('hex') }
    const runner: AgentExecutionRunner = {
        start: jest.fn(async () => {
            throw Error('Unexpected launch')
        }),
        inspect: jest.fn(async () => ({ state: 'exited' as const })),
        request: jest.fn(),
        stop: jest.fn(async () => ({ state: 'exited' as const })),
        readTaskReportFile: jest.fn(async () => report),
        collectArtifacts: jest.fn(async () => [{ id: 'artifact', versionId: 'version', name: 'report.md' }])
    }
    const invocation: AgentInvocation = {
        id: 'invocation',
        revision: 3,
        status: 'succeeded',
        createdAt: '2026-10-06T00:00:00Z',
        updatedAt: '2026-10-06T00:00:30Z',
        completedAt: '2026-10-06T00:00:30Z',
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'owner',
            parentExecutionId: 'parent',
            callerAgentKey: 'main'
        },
        request: {
            callId: 'call',
            target: { bindingId: 'binding', provider: 'test', reference: 'ref', revision: '1', configuration: {} },
            input: { prompt: 'Review', delivery: { mode: 'files', reportPath: 'output/report.md' } }
        },
        handle: {
            sessionId: 'session',
            runId: 'run',
            runner: {
                version: 1,
                invocationId: 'invocation',
                processId: 'process',
                environment: { type: 'computer', environmentId: 'computer', instanceId: 'instance' },
                grantId: 'grant',
                workingDirectory: '/owned/task',
                tool: { id: 'codex', version: 'test' }
            }
        },
        result: {
            text: '',
            report: { status: 'failed', path: 'output/report.md', code: 'report_unavailable' },
            export: { mode: 'files', status: 'failed', error: 'artifact_collection_failed' }
        }
    }
    await store.insert({ invocation, providerSource: registry.getSource(strategy) })
    const capabilities = new DefaultRuntimeCapabilityRegistry()
    capabilities.register(AgentExecutionRunnerCapability, runner)
    const access = { scope: invocation.scope, capabilities, authorize: jest.fn(async () => undefined) }
    const runtime = new AgentInvocationRuntime(store, registry)
    return { store, runner, strategy, invocation, report, access, runtime, api: runtime.scoped(access) }
}

it('recovers delivery with a new result revision and audit history, without rerunning the executor', async () => {
    const f = await fixture()
    const recovered = await f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3, paths: ['plugin.tgz'] })
    expect(recovered).toMatchObject({
        status: 'succeeded',
        completedAt: f.invocation.completedAt,
        revision: 4,
        result: {
            text: f.report.text,
            report: { status: 'completed', sha256: f.report.sha256 },
            export: { status: 'completed' }
        }
    })
    expect(recovered.result.deliveryHistory[0].report.status).toBe('failed')
    expect(recovered.updatedAt).not.toBe(recovered.completedAt)
    expect(f.runner.collectArtifacts).toHaveBeenCalledWith(f.invocation.handle.runner, {
        mode: 'files',
        paths: ['plugin.tgz', 'output/report.md']
    })
    expect(await f.api.recoverDelivery(f.invocation.id, { expectedRevision: 4 })).toEqual(recovered)
    expect(f.runner.readTaskReportFile).toHaveBeenCalledTimes(1)
    expect(f.runner.collectArtifacts).toHaveBeenCalledTimes(1)
    expect(f.strategy.start).not.toHaveBeenCalled()
    expect(f.runner.start).not.toHaveBeenCalled()
})
it.each(['revoked', 'wrong-owner', 'stale-revision', 'running', 'changed-selection'] as const)(
    'rejects %s before report or artifact I/O',
    async (kind) => {
        const f = await fixture()
        if (kind === 'revoked') f.access.authorize.mockRejectedValue(Error('Denied'))
        if (kind === 'running') f.store.rows.get(f.invocation.id).invocation.status = 'running'
        if (kind === 'changed-selection')
            f.store.rows.get(f.invocation.id).invocation.request.input.delivery = { mode: 'files', paths: ['original'] }
        const api =
            kind === 'wrong-owner'
                ? f.runtime.scoped({ ...f.access, scope: { ...f.access.scope, userId: 'other' } })
                : f.api
        await expect(
            api.recoverDelivery(f.invocation.id, {
                expectedRevision: kind === 'stale-revision' ? 2 : 3,
                paths: ['plugin.tgz']
            })
        ).rejects.toThrow()
        expect(f.runner.readTaskReportFile).not.toHaveBeenCalled()
        expect(f.runner.collectArtifacts).not.toHaveBeenCalled()
    }
)
it('rechecks authorization after I/O and never commits a stale result', async () => {
    const f = await fixture()
    f.access.authorize.mockResolvedValueOnce(undefined).mockRejectedValueOnce(Error('Revoked during read'))
    await expect(f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })).rejects.toThrow()
    expect(f.store.rows.get(f.invocation.id).invocation.revision).toBe(3)
})
it('preserves successful report delivery when only artifact export needs recovery', async () => {
    const f = await fixture()
    f.store.rows.get(f.invocation.id).invocation.result = {
        text: f.report.text,
        report: { status: 'completed', sha256: f.report.sha256 },
        export: { mode: 'files', status: 'failed' }
    }
    const recovered = await f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })
    expect(recovered.result.text).toBe(f.report.text)
    expect(f.runner.readTaskReportFile).not.toHaveBeenCalled()
})
it('keeps report delivery errors separate from successful execution', async () => {
    const f = await fixture()
    jest.mocked(f.runner.readTaskReportFile).mockRejectedValue(Error('private transport details'))
    const recovered = await f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })
    expect(recovered).toMatchObject({
        status: 'succeeded',
        result: { text: '', report: { status: 'failed', code: 'report_unavailable' } }
    })
    expect(JSON.stringify(recovered)).not.toContain('private transport details')
})

it.each(['text', 'data', 'empty', 'overflow'])(
    'leaves an ordinary %s result unchanged without a runner or delivery history',
    async (kind) => {
        const f = await fixture()
        const invocation = f.store.rows.get(f.invocation.id).invocation
        delete invocation.request.input.delivery
        delete invocation.handle.runner
        invocation.result =
            kind === 'data'
                ? { text: '', data: { updated: true } }
                : kind === 'overflow'
                  ? { text: '', textTruncated: true }
                  : { text: kind === 'text' ? 'Answer' : '' }
        const before = structuredClone(invocation)
        jest.spyOn(f.access.capabilities, 'get').mockImplementation(() => {
            throw Error('Unexpected capability lookup')
        })
        const recovered = await f.runtime.scoped(f.access).recoverDelivery(invocation.id, { expectedRevision: 3 })
        expect(recovered).toEqual(before)
        expect(recovered.result.deliveryHistory).toBeUndefined()
        expect(f.runner.collectArtifacts).not.toHaveBeenCalled()
        expect(f.runner.readTaskReportFile).not.toHaveBeenCalled()
    }
)

it('recovers artifact-only delivery without reading or requiring a report', async () => {
    const f = await fixture()
    const invocation = f.store.rows.get(f.invocation.id).invocation
    invocation.request.input.delivery = { mode: 'files', paths: ['plugin.tgz'] }
    invocation.result = { text: '', data: { built: true }, export: { mode: 'files', status: 'failed' } }
    const recovered = await f.api.recoverDelivery(invocation.id, { expectedRevision: 3 })
    expect(recovered.result.report).toBeUndefined()
    expect(recovered.result.data).toEqual({ built: true })
    expect(recovered.result.export.status).toBe('completed')
    expect(f.runner.readTaskReportFile).not.toHaveBeenCalled()
})

it.each(['missing-runner', 'missing-reader', 'missing-capability'])(
    'rejects unavailable file recovery (%s) without recording a fake retry',
    async (reason) => {
        const f = await fixture()
        if (reason === 'missing-runner') delete f.store.rows.get(f.invocation.id).invocation.handle.runner
        else if (reason === 'missing-reader') delete f.runner.readTaskReportFile
        else jest.spyOn(f.access.capabilities, 'get').mockReturnValue(undefined)
        await expect(f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })).rejects.toMatchObject({
            code: 'DeliveryRecoveryUnavailable'
        })
        expect(f.store.rows.get(f.invocation.id).invocation.revision).toBe(3)
        expect(f.runner.collectArtifacts).not.toHaveBeenCalled()
    }
)

it('refuses a concurrent result change after collection instead of overwriting it', async () => {
    const f = await fixture()
    jest.mocked(f.runner.readTaskReportFile).mockImplementationOnce(async () => {
        f.store.rows.get(f.invocation.id).invocation.revision = 4
        return f.report
    })
    await expect(f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })).rejects.toThrow()
    expect(f.store.rows.get(f.invocation.id).invocation.result.report.status).toBe('failed')
})

it('recovers a report-only file selection without requiring another explicit path list', async () => {
    const f = await fixture()
    const recovered = await f.api.recoverDelivery(f.invocation.id, { expectedRevision: 3 })
    expect(recovered.result.export.status).toBe('completed')
    expect(f.runner.collectArtifacts).toHaveBeenCalledWith(f.invocation.handle.runner, {
        mode: 'files',
        paths: ['output/report.md']
    })
    expect(f.strategy.start).not.toHaveBeenCalled()
    expect(f.runner.start).not.toHaveBeenCalled()
})
