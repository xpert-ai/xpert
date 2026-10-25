import { ExecutionControlModule } from '../execution-control/execution-control.module'
import { ExecutionControlEvidenceService } from '../execution-control/execution-control-evidence.service'
import { AssistantTaskExecution } from './assistant-task-execution'
import { ControlAssistantTaskCommand } from '../xpert-agent-execution/runtime/control-assistant-task.command'
import { TaskControlCoordinator } from './task-control-coordinator.service'
import {
    TaskControlModule,
    TaskControlStore,
    TaskControlRunner,
    RedisModule,
    REDIS_CLIENT
} from '@xpert-ai/server-core'
import { ExecutionTaskControl } from '../../../server/src/task-control/task-control.entity'
import { ControlOwnedExecutionCommand } from '../chat-conversation/commands/control-owned-execution.command'
import { DataSource } from 'typeorm'
import { Test } from '@nestjs/testing'
import { Global, Module } from '@nestjs/common'

function fixture(kind: ExecutionTaskControl['kind'] = 'managed-queue') {
    const task = {
        id: 'target',
        kind,
        resourceId: 'invocation',
        ancestors: ['root', 'target'],
        parentId: 'root',
        tenantId: 'tenant',
        organizationId: 'org',
        state: 'queued',
        claim: null
    } as ExecutionTaskControl
    const tasks = {
        delivery: jest.fn().mockResolvedValue('delivery'),
        desired: jest.fn().mockResolvedValue('terminated'),
        settleUnstarted: jest.fn().mockResolvedValue(false),
        receipt: jest.fn(),
        delivered: jest.fn(),
        descendants: jest.fn().mockResolvedValue([]),
        read: jest.fn(),
        settled: jest.fn().mockResolvedValue(false)
    }
    const record = {
        id: 'invocation',
        invocation: { scope: { tenantId: 'tenant', organizationId: 'org', userId: 'user' }, controlAdapter: undefined }
    }
    const database = { getRepository: jest.fn().mockReturnValue({ findOneBy: jest.fn().mockResolvedValue(record) }) }
    const access = {
        withControlActor: jest.fn().mockImplementation(async (_scope, work: () => Promise<unknown>) => work())
    }
    const api = {
        cancel: jest.fn().mockResolvedValue({ status: 'cancelling' }),
        inspect: jest.fn().mockResolvedValue({ status: 'running' })
    }
    const factory = { createCapturedApi: jest.fn().mockReturnValue(api) },
        runtime = { scoped: jest.fn().mockReturnValue(api) }
    const commands = { execute: jest.fn() }
    const service = new TaskControlCoordinator(
        tasks as never,
        database as never,
        runtime as never,
        factory as never,
        access as never,
        commands as never
    )
    return { task, tasks, record, access, api, factory, runtime, commands, service }
}

it('does not settle a handler from a stale queued scan when admission has already won', async () => {
    const f = fixture()
    await f.service.deliver(f.task)
    expect(f.tasks.settleUnstarted).toHaveBeenCalledWith('target')
    expect(f.tasks.receipt).not.toHaveBeenCalled()
})
it('does not replace a provider or restart business work when control delivery fails', async () => {
    const f = fixture('invocation')
    f.factory.createCapturedApi.mockImplementation(() => {
        throw new Error('Provider changed')
    })
    await f.service.deliver(f.task)
    expect(f.tasks.receipt).not.toHaveBeenCalled()
    expect(f.tasks.delivered).toHaveBeenCalledWith('target', 'delivery', 'control_unconfirmed', 5000)
})
it('retains pending control when current authorization is revoked', async () => {
    const f = fixture('invocation')
    f.access.withControlActor.mockRejectedValue(new Error('Access denied'))
    await f.service.deliver(f.task)
    expect(f.api.cancel).not.toHaveBeenCalled()
    expect(f.tasks.receipt).not.toHaveBeenCalled()
})
it('confirms an invocation pause only after its owned native child reached a safe boundary', async () => {
    const f = fixture('invocation')
    f.tasks.desired.mockResolvedValue('paused')
    f.tasks.descendants.mockResolvedValue([{ parentId: 'target', kind: 'execution', state: 'paused' }])
    await f.service.deliver(f.task)
    expect(f.tasks.receipt).not.toHaveBeenCalled()
    f.tasks.settled.mockResolvedValue(true)
    await f.service.deliver(f.task)
    expect(f.tasks.receipt).toHaveBeenCalledWith('target', 'paused')
})
it('keeps the native original handle for control while the owning handler resolves its current attempt', async () => {
    const f = fixture('invocation')
    f.record.invocation.controlAdapter = 'native-assistant-task'
    f.tasks.descendants.mockResolvedValue([
        {
            parentId: 'target',
            kind: 'execution',
            currentExecutionId: 'resumed-child',
            attempts: ['original-child', 'resumed-child']
        }
    ])
    await f.service.deliver(f.task)
    expect(f.factory.createCapturedApi).not.toHaveBeenCalled()
    expect(f.runtime.scoped).toHaveBeenCalledTimes(1)
    expect(f.api.cancel).toHaveBeenCalledWith('invocation')
    await f.runtime.scoped.mock.calls[0][0].capabilities
        .require(AssistantTaskExecution)
        .inspect({ sessionId: 's', runId: 'original-child' }, {} as never)
    expect(f.commands.execute).toHaveBeenCalledWith(new ControlAssistantTaskCommand('original-child', 'inspect'))
    expect(f.tasks.receipt).not.toHaveBeenCalled()
})
it('discards an inline graph pause on termination without replaying the graph', async () => {
    const f = fixture('invocation')
    f.task.state = 'paused'
    f.record.invocation.controlAdapter = 'native-graph'
    await f.service.deliver(f.task)
    expect(f.tasks.receipt).toHaveBeenCalledWith('target', 'completed')
    expect(f.factory.createCapturedApi).not.toHaveBeenCalled()
    expect(f.runtime.scoped).not.toHaveBeenCalled()
})
it('dispatches only the owned native child command with its original actor', async () => {
    const f = fixture('execution')
    f.tasks.read.mockResolvedValue({ kind: 'invocation', resourceId: 'invocation' })
    await f.service.deliver(f.task)
    expect(f.commands.execute).toHaveBeenCalledWith(new ControlOwnedExecutionCommand('target'))
    expect(f.access.withControlActor).toHaveBeenCalledWith(f.record.invocation.scope, expect.any(Function))
})
it('does not inspect or dispatch a target while another replica owns its delivery lease', async () => {
    const f = fixture('invocation')
    f.tasks.delivery.mockResolvedValue(null)
    await f.service.deliver(f.task)
    expect(f.tasks.desired).not.toHaveBeenCalled()
})
it('wires the core control module through constructor injection', async () => {
    const database = { entityMetadatas: [], options: {}, getRepository: jest.fn().mockReturnValue({}) }
    @Global()
    @Module({ providers: [{ provide: DataSource, useValue: database }], exports: [DataSource] })
    class DatabaseTestModule {}
    @Module({ providers: [{ provide: REDIS_CLIENT, useValue: {} }], exports: [REDIS_CLIENT] })
    class RedisTestModule {}
    const module = await Test.createTestingModule({
        imports: [DatabaseTestModule, TaskControlModule, ExecutionControlModule]
    })
        .overrideModule(RedisModule)
        .useModule(RedisTestModule)
        .compile()
    expect(module.get(ExecutionControlEvidenceService)).toBeInstanceOf(ExecutionControlEvidenceService)
    expect(module.get(TaskControlStore)).toBeInstanceOf(TaskControlStore)
    expect(module.get(TaskControlRunner)).toBeInstanceOf(TaskControlRunner)
    await module.close()
})
