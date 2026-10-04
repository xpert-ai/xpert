import { AiModelTypeEnum, type ModelExecutionContext } from '@xpert-ai/contracts'
import { DefaultRuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { ShellExecutionSourceService } from './shell-execution-source.service'
import { AssistantExecutionPolicyService } from '../model-execution/assistant-execution-policy.service'

describe('Shell CLI ownership and lifecycle', () => {
    const context: ModelExecutionContext = {
        tenantId: 'tenant',
        runtimeOrganizationId: 'org',
        actorUserId: 'user',
        billableUserId: 'user',
        xpertId: 'assistant',
        assistantVersion: 'v1',
        conversationId: 'conversation',
        tool: { id: 'codex', version: '0.159.2' },
        environment: { type: 'computer', environmentId: 'environment', instanceId: 'instance' },
        source: {
            type: 'shell_execution',
            executionId: 'child',
            shellExecutionId: 'shell',
            parentExecutionId: 'parent',
            generation: 1,
            profileRevision: '1'
        }
    }
    function setup() {
        const shell = {
            parentExecutionId: 'parent',
            generation: 1,
            runner: { receiptId: 'receipt' },
            status: 'running',
            observedAt: new Date(),
            deadline: new Date(Date.now() + 60000),
            binding: {
                xpertId: context.xpertId,
                conversationId: context.conversationId,
                assistantVersion: context.assistantVersion,
                environment: context.environment
            }
        }
        const child = { generation: 1, tool: context.tool, profileRevision: '1', status: 'running' }
        const parent = { id: 'parent', status: 'running' }
        const shells = { findOneBy: jest.fn(async () => shell) },
            children = { findOneBy: jest.fn(async () => child) },
            parents = { findOneBy: jest.fn(async () => parent) }
        const service = new ShellExecutionSourceService(
            shells as never,
            children as never,
            parents as never,
            new DefaultRuntimeCapabilityRegistry()
        )
        return { service, shell, child, parent, shells, children, parents }
    }
    it('scopes all three execution records to the original user and organization', async () => {
        const f = setup()
        await f.service.assertCurrent(context)
        expect(f.children.findOneBy).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'child',
                shellExecutionId: 'shell',
                ownerId: 'user',
                tenantId: 'tenant',
                organizationId: 'org'
            })
        )
        expect(f.parents.findOneBy).toHaveBeenCalledWith(expect.objectContaining({ id: 'parent', createdById: 'user' }))
    })
    it.each(['preparing', 'prepared', 'unknown', 'stopped', 'exited'])(
        'denies inference for a %s child',
        async (status) => {
            const f = setup()
            f.child.status = status
            await expect(f.service.assertCurrent(context)).rejects.toThrow()
        }
    )
    it('allows pending preparation but never treats that as permission to infer', async () => {
        const f = setup()
        f.child.status = 'preparing'
        await expect(f.service.assertCurrent(context, true)).resolves.toBeUndefined()
        await expect(f.service.assertCurrent(context)).rejects.toThrow()
    })
    it.each(['generation', 'revision', 'parent', 'receipt', 'heartbeat', 'deadline', 'environment', 'payer'])(
        'rejects a changed %s',
        async (field) => {
            const f = setup()
            if (field === 'generation') f.child.generation++
            if (field === 'revision') f.child.profileRevision = '2'
            if (field === 'parent') f.parent.status = 'success'
            if (field === 'receipt') f.shell.runner = null
            if (field === 'heartbeat') f.shell.observedAt = new Date(Date.now() - 31000)
            if (field === 'deadline') f.shell.deadline = new Date(0)
            if (field === 'environment')
                f.shell.binding.environment = {
                    type: 'computer',
                    environmentId: 'environment',
                    instanceId: 'replacement'
                }
            await expect(
                f.service.assertCurrent(field === 'payer' ? { ...context, billableUserId: 'another' } : context)
            ).rejects.toThrow()
        }
    )
})

describe('exact parent model selection', () => {
    const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
    const model = { id: 'original', copilotId: 'copilot', model: 'coding', modelType: AiModelTypeEnum.LLM }
    function setup() {
        const parent = {
            status: 'running',
            xpertId: 'assistant',
            threadId: 'thread',
            metadata: {
                primaryModelId: model.id,
                primaryModelSnapshot: { copilotId: model.copilotId, model: model.model, modelType: model.modelType }
            }
        }
        const executions = { findOneBy: jest.fn(async () => parent) }
        const service = new AssistantExecutionPolicyService(
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            executions as never,
            {} as never,
            {} as never,
            {} as never
        )
        const resolve = jest.spyOn(service, 'resolve').mockResolvedValue({
            assistant: { id: 'assistant' },
            conversation: { threadId: 'thread' },
            models: [model, { ...model, id: 'later' }],
            defaultModelId: 'later'
        } as never)
        return { parent, executions, service, resolve }
    }
    it('uses the parent snapshot even if another run selected a different default', async () => {
        const f = setup()
        const selection = await f.service.resolveForExecution(actor, 'conversation', 'parent')
        expect(selection.defaultModelId).toBe('original')
        expect(selection.models).toEqual([model])
        expect(f.resolve).toHaveBeenCalledWith(actor, 'conversation', false, false)
        expect(f.executions.findOneBy).toHaveBeenCalledWith({
            id: 'parent',
            tenantId: 'tenant',
            organizationId: 'org',
            createdById: 'user'
        })
    })
    it.each(['snapshot', 'model', 'thread', 'assistant', 'status'])(
        'fails closed with a missing or changed %s',
        async (field) => {
            const f = setup()
            if (field === 'snapshot') f.parent.metadata.primaryModelSnapshot = undefined
            if (field === 'model') f.parent.metadata.primaryModelSnapshot.model = 'changed'
            if (field === 'thread') f.parent.threadId = 'other-thread'
            if (field === 'assistant') f.parent.xpertId = 'other-assistant'
            if (field === 'status') f.parent.status = 'success'
            await expect(f.service.resolveForExecution(actor, 'conversation', 'parent')).rejects.toThrow()
        }
    )
})
