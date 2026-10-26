jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { Test } from '@nestjs/testing'
import { CqrsModule, CommandBus } from '@nestjs/cqrs'
import { ResolveManagedRuntimeActorCommand } from '../agent-invocation/managed/resolve-managed-runtime-actor.command'
import { ResolveManagedRuntimeActorHandler } from './resolve-managed-runtime-actor.handler'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'

test('shared CQRS handler binds deployment admission to the current Assistant and conversation', async () => {
    const scope = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'actor',
        workspaceId: 'workspace',
        conversationId: 'conversation',
        callerXpertId: 'assistant',
        callerAgentKey: 'agent',
        parentExecutionId: 'execution'
    }
    const resolve = jest.fn(async () => ({
        assistant: { id: 'assistant', workspaceId: 'workspace' },
        conversation: { projectId: 'project' }
    }))
    const module = await Test.createTestingModule({
        imports: [CqrsModule.forRoot()],
        providers: [
            ResolveManagedRuntimeActorHandler,
            { provide: AssistantExecutionPolicyService, useValue: { resolve } }
        ]
    }).compile()
    await module.init()
    try {
        const bus = module.get(CommandBus)
        expect(await bus.execute(new ResolveManagedRuntimeActorCommand(scope))).toEqual({ modelSourceId: 'assistant' })
        expect(resolve).toHaveBeenCalledWith(scope, 'conversation')
        await expect(
            bus.execute(new ResolveManagedRuntimeActorCommand({ ...scope, callerXpertId: 'other' }))
        ).rejects.toThrow()
        await expect(
            bus.execute(
                new ResolveManagedRuntimeActorCommand({ ...scope, callerType: 'project_agent', projectId: 'other' })
            )
        ).rejects.toThrow()
        resolve.mockRejectedValueOnce(new Error('access revoked'))
        await expect(bus.execute(new ResolveManagedRuntimeActorCommand(scope))).rejects.toThrow('access revoked')
    } finally {
        await module.close()
    }
})
