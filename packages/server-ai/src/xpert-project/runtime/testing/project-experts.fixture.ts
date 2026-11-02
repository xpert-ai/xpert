import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { IApiPrincipal, IUser, RolesEnum, XpertTypeEnum } from '@xpert-ai/contracts'
import {
    AgentInvocation,
    AgentInvocationRequest,
    AgentInvocationScope,
    AgentTarget,
    RequestContext
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { DataSource, EntityManager, FindOneOptions, Repository } from 'typeorm'
import { I18nService } from 'nestjs-i18n'
import type { StructuredToolInterface } from '@langchain/core/tools'
import { AgentInvocationFactoryService } from '../../../agent-invocation/invocation-factory.service'
import { AgentInvocationEntity } from '../../../agent-invocation/invocation.entity'
import { agentInvocationId } from '../../../agent-invocation/invocation-runtime'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { Xpert } from '../../../xpert/xpert.entity'
import { PublishedXpertAccessService } from '../../../xpert/published-xpert-access.service'
import { GetAccessiblePublishedXpertHandler } from '../../../xpert/published-agent/get-accessible-published-xpert.query'
import { XpertProject } from '../../entities/project.entity'
import { XpertProjectMembership } from '../../entities/project-membership.entity'
import { XpertProjectTask } from '../../entities/project-task.entity'
import { XpertProjectTaskStep } from '../../entities/project-task-step.entity'
import { XpertProjectTaskConversation } from '../../entities/project-task-conversation.entity'
import { XpertProjectTaskExecution } from '../../entities/project-task-execution.entity'
import { XpertProjectAccessService } from '../../services/project-access.service'
import { XpertProjectXpertBindingService } from '../../services/project-xpert-binding.service'
import { XpertProjectTaskService } from '../../services/project-task.service'
import { createProjectRuntimeTools } from '../../plugins/project-tasks/tools/runtime'
import { createUpdateTasksTool } from '../../plugins/project-tasks/tools/update'
import { ListProjectExpertsHandler } from '../list-project-experts.command'
import { ProjectTaskCaller } from '../project-task-dispatch.schema'
import { ProjectTaskRuntimeContextService } from '../project-task-runtime-context.service'
import { ProjectTaskRuntimeReadService } from '../project-task-runtime-read.service'
import { ProjectTaskDispatchService } from '../project-task-dispatch.service'
import { ProjectTaskCardProvider } from '../project-task-card.provider'
import {
    DispatchProjectTaskHandler,
    GetProjectRuntimeTaskHandler,
    ListProjectRuntimeBindingsHandler
} from '../project-task-runtime.handlers'

// Real CQRS, caller validation, Project/published policies, version binding, assignment and dispatch.
// Repositories simulate persistence and published grant query results; the external runtime never launches.
export async function projectExpertsFixture() {
    const tenantId = randomUUID()
    const organizationId = randomUUID()
    const actor: IUser = { id: randomUUID(), tenantId, role: { name: RolesEnum.VIEWER } } as IUser
    const auth: { principal: IApiPrincipal | null } = { principal: null }
    jest.spyOn(RequestContext, 'currentTenantId').mockImplementation(() => actor.tenantId)
    jest.spyOn(RequestContext, 'currentUserId').mockImplementation(() => actor.id)
    jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => actor)
    jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(organizationId)
    jest.spyOn(RequestContext, 'currentApiPrincipal').mockImplementation(() => auth.principal)
    jest.spyOn(RequestContext, 'isTenantScope').mockReturnValue(false)
    const expert = Object.assign(new Xpert(), {
        id: randomUUID(),
        tenantId,
        organizationId,
        workspaceId: randomUUID(),
        slug: 'xpert-plugin-developer-codex-v1',
        name: 'plugin_developer',
        title: 'Xpert 插件开发专家 · Codex',
        type: XpertTypeEnum.Agent,
        publishAt: new Date(),
        latest: true,
        version: '6',
        graph: { private: 'must not be returned' }
    })
    const records = new Map<string, Xpert>([[expert.id, expert]])
    const grants = new Set<string>([expert.id])
    const project = Object.assign(new XpertProject(), {
        id: randomUUID(),
        tenantId,
        organizationId,
        ownerId: actor.id,
        status: 'active',
        workspaceId: expert.workspaceId,
        xperts: [expert]
    })
    const conversation = Object.assign(new ChatConversation(), {
        id: randomUUID(),
        tenantId,
        organizationId,
        projectId: project.id,
        createdById: actor.id,
        purpose: 'private',
        threadId: randomUUID(),
        xpertId: expert.id
    })
    const execution = Object.assign(new XpertAgentExecution(), {
        id: randomUUID(),
        tenantId,
        organizationId,
        createdById: actor.id,
        threadId: conversation.threadId,
        agentKey: 'plugin_developer',
        xpertId: expert.id,
        xpert: expert
    })
    const caller: ProjectTaskCaller = {
        type: 'xpert',
        xpertId: expert.id,
        agentKey: execution.agentKey,
        conversationId: conversation.id,
        executionId: execution.id,
        threadId: conversation.threadId,
        sourceMessageId: 'discovery'
    }
    const task = Object.assign(new XpertProjectTask(), {
        id: randomUUID(),
        projectId: project.id,
        tenantId,
        organizationId,
        kind: 'task',
        name: 'MVP 04',
        title: 'MVP 04 | 真实知识检索',
        status: 'blocked',
        assigneeXpertId: null,
        revision: 3,
        requirements: ['Return cited diagnostic evidence'],
        steps: [],
        executions: [],
        predecessorIds: []
    })
    const target: AgentTarget = {
        bindingId: randomUUID(),
        provider: 'codex-computer',
        reference: 'codex',
        revision: '1',
        configuration: {}
    }
    const attempts: XpertProjectTaskExecution[] = []
    const invocations: AgentInvocationEntity[] = []
    const manager = Object.create(EntityManager.prototype) as EntityManager
    const projects = Object.assign(new Repository(XpertProject, manager), {
        findOne: jest.fn(async (options: FindOneOptions<XpertProject>) => {
            const where = options.where
            return where &&
                !Array.isArray(where) &&
                where.id === project.id &&
                where.tenantId === project.tenantId &&
                where.organizationId === project.organizationId
                ? project
                : null
        }),
        save: jest.fn()
    })
    const xperts = Object.assign(new Repository(Xpert, manager), {
        findOne: jest.fn(async (options: FindOneOptions<Xpert>) => {
            const where = options.where
            if (!where || Array.isArray(where)) return null
            return (
                [...records.values()].find(
                    (item) =>
                        item.tenantId === where.tenantId &&
                        (where.organizationId === undefined || item.organizationId === where.organizationId) &&
                        (!where.publishAt || !!item.publishAt) &&
                        (typeof where.id === 'string'
                            ? item.id === where.id
                            : item.latest === where.latest &&
                              item.slug === where.slug &&
                              item.type === where.type &&
                              item.workspaceId === where.workspaceId)
                ) ?? null
            )
        }),
        createQueryBuilder: jest.fn(() => {
            let requestedId: string | undefined
            const capture = (_condition: unknown, parameters?: { id?: string }) => {
                if (parameters?.id) requestedId = parameters.id
                return query
            }
            const query = {
                leftJoin: jest.fn().mockReturnThis(),
                where: jest.fn(capture),
                andWhere: jest.fn(capture),
                getCount: jest.fn(async () => (grants.has(requestedId) ? 1 : 0))
            }
            return query
        })
    })
    const membership = { findOne: jest.fn<Promise<Pick<XpertProjectMembership, 'role'> | null>, []>(async () => null) }
    const conversations = {
        findOneBy: jest.fn(async (where: Partial<ChatConversation>) =>
            where.id === conversation.id &&
            where.projectId === conversation.projectId &&
            where.tenantId === conversation.tenantId &&
            where.organizationId === conversation.organizationId
                ? conversation
                : null
        ),
        manager: { getRepository: () => ({ findOneBy: async () => null }) }
    }
    const executions = {
        findOne: jest.fn(async (options: FindOneOptions<XpertAgentExecution>) => {
            const where = options.where
            return where &&
                !Array.isArray(where) &&
                where.id === execution.id &&
                where.tenantId === execution.tenantId &&
                where.organizationId === execution.organizationId &&
                where.createdById === execution.createdById
                ? execution
                : null
        })
    }
    const tasks = Object.assign(new Repository(XpertProjectTask, manager), {
        findOne: jest.fn(async () => task),
        find: jest.fn(async (options) => (options.where.id ? [] : [task])),
        save: jest.fn(async (value: XpertProjectTask | XpertProjectTask[]) => {
            for (const item of Array.isArray(value) ? value : [value]) item.revision++
            return value
        })
    })
    const attemptRepo = Object.assign(new Repository(XpertProjectTaskExecution, manager), {
        find: jest.fn(async () => attempts),
        existsBy: jest.fn(async () => attempts.length > 0),
        create: jest.fn((value) => Object.assign(new XpertProjectTaskExecution(), value)),
        save: jest.fn(async (value: XpertProjectTaskExecution) => {
            attempts.push(value)
            return value
        }),
        update: jest.fn(async (where, patch) =>
            Object.assign(
                attempts.find((item) => item.id === where.id),
                patch
            )
        ),
        createQueryBuilder: jest.fn(() => {
            let requestId: string
            const query = {
                addSelect: jest.fn().mockReturnThis(),
                where: jest.fn((where) => {
                    requestId = where.dispatchRequestId
                    return query
                }),
                getOne: jest.fn(async () => attempts.find((item) => item.dispatchRequestId === requestId))
            }
            return query
        })
    })
    const steps = { save: jest.fn(async (value) => value) }
    const invocationRepo = {
        find: jest.fn(async () => invocations),
        findOneBy: jest.fn(async () => invocations[0] ?? null)
    }
    let committed = false
    Object.assign(manager, {
        getRepository: (entity: unknown) => {
            if (entity === XpertProject) return projects
            if (entity === XpertProjectTask) return tasks
            if (entity === XpertProjectTaskStep) return steps
            if (entity === XpertProjectTaskExecution) return attemptRepo
            if (entity === AgentInvocationEntity) return invocationRepo
            throw new Error('Unexpected repository')
        },
        transaction: async (operation: (transaction: EntityManager) => Promise<unknown>) => {
            const result = await operation(manager)
            committed = true
            return result
        }
    })
    const start = jest.fn(
        async (scope: AgentInvocationScope, request: AgentInvocationRequest): Promise<AgentInvocation> => {
            expect(committed).toBe(true)
            expect(attempts).toHaveLength(1)
            const invocation: AgentInvocation = {
                id: agentInvocationId(scope, request.callId),
                scope,
                request,
                revision: 1,
                status: 'running',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
            invocations.push(Object.assign(new AgentInvocationEntity(), { id: invocation.id, invocation }))
            return invocation
        }
    )
    const factory = {
        listProjectBindings: jest.fn(async () => [
            { bindingId: target.bindingId, provider: target.provider, title: 'Codex Computer' }
        ]),
        resolveBackgroundTarget: jest.fn(async () => target),
        createCapturedApi: jest.fn((scope: AgentInvocationScope) => ({
            start: (request: AgentInvocationRequest) => start(scope, request)
        }))
    }
    const module = await Test.createTestingModule({
        imports: [CqrsModule],
        providers: [
            { provide: DataSource, useValue: { manager } },
            ListProjectExpertsHandler,
            GetAccessiblePublishedXpertHandler,
            PublishedXpertAccessService,
            XpertProjectXpertBindingService,
            XpertProjectAccessService,
            ProjectTaskRuntimeContextService,
            XpertProjectTaskService,
            ProjectTaskDispatchService,
            ProjectTaskRuntimeReadService,
            ProjectTaskCardProvider,
            DispatchProjectTaskHandler,
            GetProjectRuntimeTaskHandler,
            ListProjectRuntimeBindingsHandler,
            { provide: getRepositoryToken(Xpert), useValue: xperts },
            { provide: getRepositoryToken(XpertProject), useValue: projects },
            { provide: getRepositoryToken(XpertProjectMembership), useValue: membership },
            { provide: getRepositoryToken(ChatConversation), useValue: conversations },
            { provide: getRepositoryToken(XpertAgentExecution), useValue: executions },
            { provide: getRepositoryToken(XpertProjectTask), useValue: tasks },
            { provide: getRepositoryToken(XpertProjectTaskExecution), useValue: attemptRepo },
            { provide: getRepositoryToken(XpertProjectTaskStep), useValue: steps },
            { provide: getRepositoryToken(XpertProjectTaskConversation), useValue: {} },
            { provide: AgentInvocationFactoryService, useValue: factory },
            { provide: I18nService, useValue: {} }
        ]
    }).compile()
    await module.init()
    const commands = module.get(CommandBus)
    const access = module.get(XpertProjectAccessService)
    const permission = () => access.assertCanEdit(project.id)
    const tools = createProjectRuntimeTools({ ...caller, projectId: project.id }, commands, permission)
    const update = createUpdateTasksTool({
        projectId: project.id,
        service: module.get(XpertProjectTaskService),
        assertPermission: permission
    })
    const tool = (name: string): StructuredToolInterface => {
        const item = tools.find((item) => item.name === name)
        if (!item) throw new Error(`Missing tool ${name}`)
        return item
    }
    return {
        module,
        commands,
        caller,
        expert,
        project,
        conversation,
        execution,
        task,
        records,
        grants,
        auth,
        actor,
        organizationId,
        target,
        attempts,
        start,
        factory,
        tool,
        update,
        projects,
        xperts,
        membership,
        tasks
    }
}
