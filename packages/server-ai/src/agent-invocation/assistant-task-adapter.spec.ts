jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { DiscoveryService, Reflector } from '@nestjs/core'
import { AgentRuntimeRegistry, BUILTIN_GLOBAL_SCOPE, RequestContext } from '@xpert-ai/plugin-sdk'
import { AgentInvocationRuntime } from './invocation-runtime'
import { MemoryInvocationStore } from './invocation-test-store'
import { AssistantTaskRuntimeStrategy, invokeAssistantTask } from './assistant-task-adapter'

function fixture() {
    const store = new MemoryInvocationStore()
    const registry = new AgentRuntimeRegistry({} as DiscoveryService, new Reflector())
    registry.register('xpert-task', new AssistantTaskRuntimeStrategy(), {
        kind: 'builtin',
        scopeKey: BUILTIN_GLOBAL_SCOPE
    })
    const runtime = new AgentInvocationRuntime(store, registry)
    const input = { xpertId: 'assistant', agentKey: 'main', prompt: 'task', clientMessageId: 'operation-1' }
    const target = { id: 'expert', revision: '1', workspaceId: 'workspace' }
    const executor = {
        start: jest.fn(async (id: string) => ({
            status: 'running' as const,
            taskId: 'task',
            executionId: id,
            conversationId: id
        })),
        inspect: jest.fn(),
        cancel: jest.fn()
    }
    const authorize = jest.fn(async () => undefined)
    return {
        store,
        runtime,
        input,
        target,
        executor,
        authorize,
        start: () => invokeAssistantTask(runtime, input, target, executor, authorize)
    }
}

describe('Assistant Task invocation adapter', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization')
    })
    afterEach(() => jest.restoreAllMocks())
    it('persists the reservation before transport launch and reuses an explicit operation id', async () => {
        const f = fixture()
        f.executor.start.mockImplementation(async (id) => {
            expect(f.store.rows.get(id)?.invocation.handle?.runId).toBe(id)
            return { status: 'running', taskId: 'task', executionId: id, conversationId: id }
        })
        const first = await f.start()
        expect(await f.start()).toEqual(first)
        expect(f.executor.start).toHaveBeenCalledTimes(1)
    })
    it('rejects changed task input or revoked bindings without launching another task', async () => {
        const f = fixture()
        await f.start()
        f.input.prompt = 'other'
        await expect(f.start()).rejects.toThrow()
        f.input.prompt = 'task'
        f.authorize.mockRejectedValueOnce(new Error('revoked'))
        await expect(f.start()).rejects.toThrow('revoked')
        expect(f.executor.start).toHaveBeenCalledTimes(1)
    })
    it('does not use a recurring schedule id as an operation id', async () => {
        const f = fixture()
        const input = { ...f.input, clientMessageId: undefined, taskId: 'schedule' }
        await invokeAssistantTask(f.runtime, input, f.target, f.executor, f.authorize)
        await invokeAssistantTask(f.runtime, input, f.target, f.executor, f.authorize)
        expect(f.executor.start).toHaveBeenCalledTimes(2)
    })
})
