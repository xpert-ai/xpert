// Exercise the real dispatch and authorization boundaries; only storage, transport and graph execution are fixtures.
import { CommandBus, CommandHandler, CqrsModule, ICommandHandler } from '@nestjs/cqrs'
import { Test, TestingModule } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import {
    AIPermissionsEnum,
    KBDocumentStatusEnum,
    RolesEnum,
    UserType,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import {
    AgentChatCallbackEnvelopePayload,
    AgentChatDispatchPayload,
    HandoffMessage,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import {
    Organization,
    ResolvedExecutionIdentity,
    ResolveExecutionIdentityCommand,
    runWithExecutionIdentity,
    User,
    UserOrganization,
    UserService
} from '@xpert-ai/server-core'
import { of } from 'rxjs'
import { EntityManager, In, Repository } from 'typeorm'
import { ExecutionUserLoader } from '../../../../server/src/user/execution-identity/execution-user-loader'
import { ResolveExecutionIdentityHandler } from '../../../../server/src/user/execution-identity/resolve-execution-identity.handler'
import { ResolveUserOrganizationAccessHandler } from '../../../../server/src/user-organization/commands/handlers/resolve-user-organization-access.handler'
import { HandoffQueueService } from '../../handoff/message-queue.service'
import { AgentChatRealtimeService } from '../../handoff/agent-chat-realtime.service'
import { AgentChatDispatchHandoffProcessor } from '../../handoff/plugins/agent-chat/agent-chat-dispatch.processor'
import { XpertWorkspace } from '../../xpert-workspace/workspace.entity'
import { XpertWorkspaceAccessService } from '../../xpert-workspace/workspace-access.service'
import { XpertWorkspaceBaseService } from '../../xpert-workspace/workspace-base.service'
import { Xpert } from '../../xpert/xpert.entity'
import { XpertService } from '../../xpert/xpert.service'
import { XpertChatCommand } from '../../xpert/commands/chat.command'
import { XpertEnqueueTriggerDispatchHandler } from '../../xpert/commands/handlers/enqueue-trigger-dispatch.handler'
import { XpertAgentExecutionUpsertCommand } from '../../xpert-agent-execution/commands/upsert.command'
import { dispatchKnowledgePipeline, KnowledgePipelineInputs } from './pipeline-task'
import { KnowledgebaseTaskService } from './task.service'
import { KnowledgebaseTask } from './task.entity'
import { Knowledgebase } from '../persistence/knowledgebase.entity'
import { KnowledgePipelineCallbackProcessor } from './pipeline-callback.processor'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'

@CommandHandler(XpertAgentExecutionUpsertCommand)
class PreallocateExecutionHandler implements ICommandHandler<XpertAgentExecutionUpsertCommand> {
    async execute() {
        return { id: 'execution' }
    }
}

@CommandHandler(XpertChatCommand)
class WorkspaceGuardedChatHandler implements ICommandHandler<XpertChatCommand> {
    observations: Array<{ userId: string; hasRole: boolean; canChat: boolean }> = []

    constructor(private readonly xperts: XpertService) {}

    async execute(command: XpertChatCommand) {
        this.observations.push({
            userId: RequestContext.currentUserId(),
            hasRole: !!RequestContext.currentUser()?.role,
            canChat: RequestContext.hasPermission(AIPermissionsEnum.CHAT_VIEW)
        })
        // The real chat handler enters through this same workspace runtime guard before constructing its graph.
        await this.xperts.findOneForRuntime(command.options.xpertId)
        return of()
    }
}

function isCallbackPayload(
    payload: AgentChatDispatchPayload | AgentChatCallbackEnvelopePayload
): payload is AgentChatCallbackEnvelopePayload {
    return (
        (payload.kind === 'stream' || payload.kind === 'complete' || payload.kind === 'error') &&
        typeof payload.sourceMessageId === 'string' &&
        typeof payload.sequence === 'number'
    )
}

describe('Knowledge pipeline dispatch identity', () => {
    let module: TestingModule
    let message: HandoffMessage<AgentChatDispatchPayload>
    let user: ReturnType<typeof createUser>
    let requestIdentity: ResolvedExecutionIdentity
    const users = { findOne: jest.fn() }
    const memberships = { findOne: jest.fn() }
    const dispatches: HandoffMessage<AgentChatDispatchPayload>[] = []
    const callbacks: HandoffMessage<AgentChatCallbackEnvelopePayload>[] = []
    const enqueue = jest.fn(
        async (envelope: HandoffMessage<AgentChatDispatchPayload | AgentChatCallbackEnvelopePayload>) => {
            if (isCallbackPayload(envelope.payload)) callbacks.push({ ...envelope, payload: envelope.payload })
            else dispatches.push({ ...envelope, payload: envelope.payload })
            return { id: 'job' }
        }
    )
    const manager = { update: jest.fn(), findOne: jest.fn() }
    const taskRepository = {
        manager: {
            findOne: jest.fn(),
            transaction: jest.fn(
                async (work: (transaction: Pick<EntityManager, 'update' | 'findOne'>) => Promise<void>) => work(manager)
            )
        }
    }

    function createUser() {
        return {
            id: 'user',
            tenantId: 'tenant',
            type: UserType.USER,
            isActive: true,
            roleId: 'role',
            role: {
                id: 'role',
                tenantId: 'tenant',
                name: RolesEnum.AI_BUILDER,
                rolePermissions: [
                    AIPermissionsEnum.XPERT_VIEW,
                    AIPermissionsEnum.XPERT_EDIT,
                    AIPermissionsEnum.CHAT_VIEW
                ].map((permission) => ({ roleId: 'role', tenantId: 'tenant', permission, enabled: true }))
            }
        }
    }

    beforeEach(async () => {
        jest.clearAllMocks()
        dispatches.length = 0
        callbacks.length = 0
        user = createUser()
        users.findOne.mockResolvedValue(user)
        memberships.findOne.mockResolvedValue({ isActive: true })
        manager.update.mockResolvedValue({ affected: 1 })
        manager.findOne.mockResolvedValue({ documents: [{ id: 'doc' }] })
        taskRepository.manager.findOne.mockResolvedValue(null)
        const workspace = Object.assign(new XpertWorkspace(), {
            id: 'workspace',
            tenantId: 'tenant',
            organizationId: 'org',
            ownerId: 'user',
            members: []
        })
        const xpert = Object.assign(new Xpert(), {
            id: 'pipeline',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace'
        })
        module = await Test.createTestingModule({
            imports: [CqrsModule],
            providers: [
                ExecutionUserLoader,
                ResolveExecutionIdentityHandler,
                ResolveUserOrganizationAccessHandler,
                XpertWorkspaceAccessService,
                XpertEnqueueTriggerDispatchHandler,
                AgentChatDispatchHandoffProcessor,
                WorkspaceGuardedChatHandler,
                PreallocateExecutionHandler,
                KnowledgebaseTaskService,
                KnowledgePipelineCallbackProcessor,
                { provide: getRepositoryToken(User), useValue: users },
                { provide: getRepositoryToken(UserOrganization), useValue: memberships },
                {
                    provide: getRepositoryToken(Organization),
                    useValue: { findOne: jest.fn().mockResolvedValue({ id: 'org' }) }
                },
                {
                    provide: getRepositoryToken(XpertWorkspace),
                    useValue: { findOne: jest.fn().mockResolvedValue(workspace) }
                },
                { provide: getRepositoryToken(Xpert), useValue: { findOne: jest.fn().mockResolvedValue(xpert) } },
                { provide: getRepositoryToken(KnowledgebaseTask), useValue: taskRepository },
                { provide: getRepositoryToken(Knowledgebase), useValue: {} },
                {
                    provide: XpertService,
                    useFactory: (repository: Repository<Xpert>, access: XpertWorkspaceAccessService) =>
                        new XpertWorkspaceBaseService(repository, access),
                    inject: [getRepositoryToken(Xpert), XpertWorkspaceAccessService]
                },
                {
                    provide: UserService,
                    useValue: { findOne: jest.fn().mockResolvedValue({ preferredLanguage: 'en' }) }
                },
                { provide: HandoffQueueService, useValue: { enqueue } },
                { provide: AgentChatRealtimeService, useValue: { publish: jest.fn() } }
            ]
        }).compile()
        await module.init()
        jest.spyOn(module.get(KnowledgebaseTaskService), 'startDocumentExecution').mockResolvedValue(undefined)
        const bus = module.get(CommandBus)
        requestIdentity = await bus.execute(
            new ResolveExecutionIdentityCommand({
                tenantId: 'tenant',
                organizationId: 'org',
                userId: 'user',
                kind: 'user'
            })
        )
        await runWithExecutionIdentity(requestIdentity, async () => {
            await expect(module.get(XpertWorkspaceAccessService).assertCanRun('workspace')).resolves.toBeDefined()
        })
        await dispatch({ stage: 'prod', sources: { lark: { documents: ['doc'] } } })
        users.findOne.mockClear()
        memberships.findOne.mockClear()
        expect(RequestContext.currentUserId()).toBeNull()
    })

    afterEach(async () => {
        jest.restoreAllMocks()
        await module?.close()
    })

    function consume() {
        return module.get(AgentChatDispatchHandoffProcessor).process(message, {
            runId: 'run',
            traceId: 'trace',
            abortSignal: new AbortController().signal
        })
    }

    async function dispatch(inputs: KnowledgePipelineInputs) {
        await runWithExecutionIdentity(requestIdentity, () =>
            dispatchKnowledgePipeline(
                module.get(CommandBus),
                module.get(KnowledgebaseTaskService),
                'kb',
                'pipeline',
                'task',
                inputs
            )
        )
        message = dispatches[dispatches.length - 1]
    }

    it('carries the authenticated owner from the real pipeline producer through the real runtime guard', async () => {
        expect(message.tenantId).toBe('tenant')
        expect(message.headers).toMatchObject({ userId: 'user', organizationId: 'org', authenticatedUserId: 'user' })
        expect(await consume()).toEqual({ status: 'ok' })
        expect(users.findOne).toHaveBeenCalledTimes(1)
        expect(users.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: 'user', tenantId: 'tenant' } })
        )
        expect(memberships.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    userId: 'user',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    isActive: true
                })
            })
        )
        expect(module.get(WorkspaceGuardedChatHandler).observations).toEqual([
            { userId: 'user', hasRole: true, canChat: true }
        ])
        expect(callbacks[0].payload).toMatchObject({
            kind: 'complete',
            context: { knowledgebaseId: 'kb', taskId: 'task', executionId: 'execution' }
        })
        await module.get(KnowledgePipelineCallbackProcessor).process(callbacks[0])
        expect(manager.update).not.toHaveBeenCalled()
        expect(RequestContext.currentUserId()).toBeNull()
    })

    it('also preserves the actor for draft preprocessing', async () => {
        const update = jest
            .spyOn(module.get(KnowledgebaseTaskService), 'update')
            .mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] })
        await dispatch({ stage: 'preview', isDraft: true, sources: { lark: { documents: ['doc'] } } })
        expect(update).toHaveBeenCalledWith(
            'task',
            expect.objectContaining({ status: 'running', executionId: 'execution' })
        )
        expect(message.headers.authenticatedUserId).toBe('user')
        expect(message.payload.options.isDraft).toBe(true)
        expect(await consume()).toEqual({ status: 'ok' })
    })

    it('keeps legacy untrusted user IDs denied and records failure for the exact task, execution and documents', async () => {
        delete message.headers.authenticatedUserId
        expect(message.headers).toMatchObject({ userId: 'user', organizationId: 'org' })
        expect(message.headers.authenticatedUserId).toBeUndefined()
        expect(await consume()).toEqual({ status: 'dead', reason: 'Access denied to workspace' })
        expect(users.findOne).not.toHaveBeenCalled()
        expect(module.get(WorkspaceGuardedChatHandler).observations).toEqual([
            { userId: 'user', hasRole: false, canChat: false }
        ])
        expect(callbacks[0].payload).toMatchObject({
            kind: 'error',
            error: 'Access denied to workspace',
            context: { knowledgebaseId: 'kb', taskId: 'task', executionId: 'execution' }
        })
        await module.get(KnowledgePipelineCallbackProcessor).process(callbacks[0])
        const scope = { tenantId: 'tenant', organizationId: 'org' }
        expect(manager.update).toHaveBeenCalledTimes(3)
        expect(manager.update).toHaveBeenNthCalledWith(
            1,
            KnowledgebaseTask,
            { ...scope, id: 'task', knowledgebaseId: 'kb', executionId: 'execution', status: 'running' },
            { status: 'failed', error: 'Access denied to workspace', finishedAt: expect.any(Date) }
        )
        expect(manager.update).toHaveBeenNthCalledWith(
            2,
            XpertAgentExecution,
            { ...scope, id: 'execution', status: XpertAgentExecutionStatusEnum.RUNNING },
            { status: XpertAgentExecutionStatusEnum.ERROR, error: 'Access denied to workspace' }
        )
        expect(manager.update).toHaveBeenNthCalledWith(
            3,
            KnowledgeDocument,
            expect.objectContaining({
                ...scope,
                id: In(['doc']),
                knowledgebaseId: 'kb',
                processingExecutionId: 'execution'
            }),
            { status: KBDocumentStatusEnum.ERROR, processMsg: 'Access denied to workspace' }
        )
    })

    it('still denies permissions revoked after enqueue', async () => {
        expect(await consume()).toEqual({ status: 'ok' })
        user.role.rolePermissions.find((grant) => grant.permission === AIPermissionsEnum.CHAT_VIEW).enabled = false
        expect(await consume()).toEqual({ status: 'dead', reason: 'Access denied to workspace' })
        expect(users.findOne).toHaveBeenCalledTimes(2)
    })

    it.each(['inactive-user', 'revoked-organization', 'wrong-tenant'])(
        'rejects %s before chat admission',
        async (scenario) => {
            if (scenario === 'inactive-user') user.isActive = false
            else if (scenario === 'wrong-tenant') user.tenantId = 'other-tenant'
            else memberships.findOne.mockResolvedValue(null)
            expect(await consume()).toMatchObject({ status: 'dead' })
            expect(module.get(WorkspaceGuardedChatHandler).observations).toEqual([])
            expect(callbacks[0].payload).toMatchObject({
                kind: 'error',
                context: { knowledgebaseId: 'kb', taskId: 'task', executionId: 'execution' }
            })
        }
    )

    it('does not restore grants from a mismatched marker', async () => {
        message.headers.authenticatedUserId = 'other-user'
        expect(await consume()).toEqual({ status: 'dead', reason: 'Access denied to workspace' })
        expect(users.findOne).not.toHaveBeenCalled()
    })

    it('does not let a stale callback overwrite a newer task execution', async () => {
        user.isActive = false
        expect(await consume()).toMatchObject({ status: 'dead' })
        manager.update.mockResolvedValueOnce({ affected: 0 })
        await module.get(KnowledgePipelineCallbackProcessor).process(callbacks[0])
        expect(manager.update).toHaveBeenCalledTimes(1)
        expect(manager.findOne).not.toHaveBeenCalled()
    })
})
