jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import type { AgentInvocation, AgentRunnerExitEvidence } from '@xpert-ai/plugin-sdk'
import { MemoryInvocationStore } from './invocation-test-store'
import { RecordRunnerTerminationCommand } from './runner-termination.command'
import { RecordRunnerTerminationHandler } from './runner-termination.handler'
import { invocationCanRelease } from './invocation-control-evidence'
import { ProjectRuntimeObservationCommand } from '../handoff/runtime-messaging/runtime-message.commands'

async function fixture() {
    const invocation: AgentInvocation = {
        id: 'invocation',
        revision: 1,
        status: 'running',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        scope: {
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'user',
            parentExecutionId: 'parent',
            callerAgentKey: 'main'
        },
        request: {
            callId: 'call',
            target: { bindingId: 'binding', revision: '1', provider: 'codex', reference: 'codex', configuration: {} },
            input: { prompt: 'work' }
        },
        executionTarget: { version: 1, kind: 'provider', generation: '898d3b09-98d5-45eb-993d-e807bde882a6' },
        completionEvidence: 2,
        handle: {
            sessionId: 'session',
            runId: 'run',
            runner: {
                version: 2,
                invocationId: 'invocation',
                supervision: 1,
                processId: 'process',
                environment: { type: 'computer', environmentId: 'environment', instanceId: 'container' },
                nativeLeaseId: 'lease',
                connection: { mode: 'native', revision: 1 },
                workingDirectory: '/workspace/project',
                executionDirectory: '/workspace/project/run',
                tool: { id: 'codex', version: '1' }
            }
        }
    }
    const store = new MemoryInvocationStore()
    await store.insert({ invocation, providerSource: { kind: 'builtin', scopeKey: 'builtin:global' } })
    const tasks = {
        find: jest.fn(async () => ({ id: 'control', claim: 'claim' })),
        receipt: jest.fn(async () => undefined)
    }
    const commands = { execute: jest.fn(async () => undefined) }
    const handler = new RecordRunnerTerminationHandler(store, tasks as never, commands as never)
    const receipt = invocation.handle.runner
    const completion: AgentRunnerExitEvidence = {
        version: 1,
        coverage: 'descendants',
        invocationId: invocation.id,
        environment: receipt.environment,
        processId: receipt.processId
    }
    const request = () =>
        handler.execute(
            new RecordRunnerTerminationCommand(invocation.scope, receipt, {
                type: 'request',
                reason: 'authorization_revoked'
            })
        )
    const confirm = () =>
        handler.execute(new RecordRunnerTerminationCommand(invocation.scope, receipt, { type: 'confirm', completion }))
    const read = async () => (await store.read(invocation.id, invocation.scope)).invocation
    return { invocation, store, tasks, commands, handler, receipt, completion, request, confirm, read }
}

describe('trusted runner termination bookkeeping', () => {
    it('persists the cause before stopping, and settles only after matching descendant-exit evidence', async () => {
        const f = await fixture()
        expect(await f.confirm()).toBe(false)
        await f.request()
        const pending = await f.read()
        expect(pending.status).toBe('cancelling')
        expect(pending.runnerTermination.reason).toBe('authorization_revoked')
        expect(invocationCanRelease(pending)).toBe(false)
        expect(f.commands.execute).not.toHaveBeenCalled()
        await f.confirm()
        const final = await f.read()
        expect(final.status).toBe('failed')
        expect(final.error).toMatch(/^\[authorization_revoked\]/)
        expect(final.handle.metadata.completion).toMatchObject({ code: 'authorization_revoked' })
        expect(invocationCanRelease(final)).toBe(true)
        expect(f.tasks.receipt).toHaveBeenCalledWith('control', 'completed', 'claim')
        expect(f.commands.execute).toHaveBeenCalledWith(
            new ProjectRuntimeObservationCommand('invocation', {
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user'
            })
        )
    })

    it('preserves the first cause across repeated requests, restarts and duplicate confirmations', async () => {
        const f = await fixture()
        await f.request()
        await f.handler.execute(
            new RecordRunnerTerminationCommand(f.invocation.scope, f.receipt, {
                type: 'request',
                reason: 'runner_unavailable'
            })
        )
        const recovered = new RecordRunnerTerminationHandler(f.store, f.tasks as never, f.commands as never)
        await recovered.execute(
            new RecordRunnerTerminationCommand(f.invocation.scope, f.receipt, {
                type: 'confirm',
                completion: f.completion
            })
        )
        const final = await f.read()
        await f.confirm()
        expect((await f.read()).revision).toBe(final.revision)
        expect((await f.read()).error).toMatch(/^\[authorization_revoked\]/)
    })

    it.each(['tenantId', 'organizationId', 'userId', 'parentExecutionId'] as const)(
        'rejects a stale or foreign %s',
        async (field) => {
            const f = await fixture()
            const action = f.handler.execute(
                new RecordRunnerTerminationCommand({ ...f.invocation.scope, [field]: 'other' }, f.receipt, {
                    type: 'request',
                    reason: 'authorization_revoked'
                })
            )
            if (field === 'parentExecutionId') await expect(action).rejects.toThrow()
            else expect(await action).toBe(false)
            expect((await f.read()).status).toBe('running')
        }
    )

    it('rejects a different runner receipt or container generation', async () => {
        const f = await fixture()
        await expect(
            f.handler.execute(
                new RecordRunnerTerminationCommand(
                    f.invocation.scope,
                    {
                        ...f.receipt,
                        environment: { ...f.receipt.environment, instanceId: 'other' }
                    },
                    { type: 'request', reason: 'authorization_revoked' }
                )
            )
        ).rejects.toThrow()
        await f.request()
        await expect(
            f.handler.execute(
                new RecordRunnerTerminationCommand(f.invocation.scope, f.receipt, {
                    type: 'confirm',
                    completion: { ...f.completion, processId: 'other' }
                })
            )
        ).rejects.toThrow()
        expect((await f.read()).status).toBe('cancelling')
        expect(f.commands.execute).not.toHaveBeenCalled()
    })

    it('rechecks the receipt after a concurrent update instead of overwriting a replacement process', async () => {
        const f = await fixture()
        jest.spyOn(f.store, 'replace').mockImplementationOnce(async () => {
            const newer = f.store.rows.get('invocation')
            newer.invocation.handle.runner.processId = 'newer-process'
            newer.invocation.revision++
            return false
        })
        await expect(f.request()).rejects.toThrow()
        expect((await f.read()).handle.runner.processId).toBe('newer-process')
        expect((await f.read()).runnerTermination).toBeUndefined()
    })

    it('cannot overwrite a successful terminal result', async () => {
        const f = await fixture()
        const record = f.store.rows.get('invocation')
        record.invocation.status = 'succeeded'
        record.invocation.result = { text: 'accepted result' }
        expect(await f.request()).toBe(false)
        expect((await f.read()).status).toBe('succeeded')
    })

    it('retries projection after a post-commit failure without another invocation revision', async () => {
        const f = await fixture()
        await f.request()
        f.commands.execute.mockRejectedValueOnce(new Error('projection temporarily unavailable'))
        await expect(f.confirm()).rejects.toThrow('projection temporarily unavailable')
        const final = await f.read()
        await f.confirm()
        expect((await f.read()).revision).toBe(final.revision)
        expect(f.commands.execute).toHaveBeenCalledTimes(2)
    })
})
