import { AuthorizeProjectPipelineRuntimeCommand } from '../xpert-project/pipeline/runtime/pipeline-runtime-access.command'
import { ClaimAgentRuntimeResultsCommand } from '../handoff/runtime-messaging/runtime-message.commands'
import {
    GroupTaskTargetItem,
    ListGroupTaskTargetsCommand,
    ResolveGroupTaskTargetCommand,
    ExecuteGroupTaskCommand
} from '../chat-group/group-project/group-task.commands'
import {
    agentRuntimeModelSourceSchema,
    assistantTaskGroupContext,
    type ProjectPipelineCatalog
} from '@xpert-ai/contracts'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { XpertWorkspace } from '../xpert-workspace/workspace.entity'
import { AgentInvocationError } from './invocation-errors'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AgentInvocation,
    projectPipelineInvocationScopeSchema,
    AgentInvocationApi,
    agentInvocationDispatchContextSchema,
    AgentExecutionRunnerCapability,
    AgentExecutionRunnerFactoryCapability,
    AgentRuntimeFactory,
    AgentRuntimeFactoryCapability,
    AgentInvocationScope,
    AgentTarget,
    DefaultRuntimeCapabilityRegistry,
    RequestContext,
    RuntimeCapabilityProvider,
    RuntimeIdentityScope,
    RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN,
    ProjectAccessRuntimeCapability,
    type ProjectAccessActor
} from '@xpert-ai/plugin-sdk'
import { In, Repository } from 'typeorm'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { resolveAgentExecutionScope } from '../shared/agent/middleware-runtime/execution-scope'
import { AgentRuntimeBindingEntity, AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationRuntime, invocationError, sameInvocationData } from './invocation-runtime'
import { awaitInvocationTasks } from './invocation-task-wait'
import { z } from 'zod/v3'
import { InvocationCardProvider } from './execution-view/invocation-card.provider'
import { AssistantTaskExecution } from './assistant-task-execution'

@Injectable()
@RuntimeCapabilityProvider(AgentRuntimeFactoryCapability)
export class AgentInvocationFactoryService implements AgentRuntimeFactory {
    constructor(
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>,
        private readonly queries: QueryBus,
        private readonly runtime: AgentInvocationRuntime,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry,
        @Optional()
        @InjectRepository(AgentInvocationEntity)
        private readonly records?: Repository<AgentInvocationEntity>,
        @Optional() private readonly commands?: CommandBus,
        @Optional() private readonly cards?: InvocationCardProvider
    ) {}

    /** Host-only replay uses the persisted identity, never the next graph turn's ambient scope. */
    createCapturedApi(scope: AgentInvocationScope): AgentInvocationApi {
        return this.createApi({ xpertId: scope.callerXpertId }, structuredClone(scope))
    }

    async resolveBackgroundTarget(scope: AgentInvocationScope, bindingId: string): Promise<AgentTarget> {
        const target = await this.createCapturedApi(scope).resolve(bindingId)
        this.runtime.assertBackgroundTarget(target, scope.organizationId)
        const computer = z
            .object({ type: z.literal('computer') })
            .passthrough()
            .safeParse(target.configuration.executionEnvironment)
        if (
            scope.callerType === 'project_agent' &&
            computer.success &&
            !agentRuntimeModelSourceSchema.safeParse(target.configuration.modelSource).success
        )
            throw invocationError('ModelSourceRequired')
        return target
    }

    /** Read-only preflight for a host Pipeline before its durable work is instantiated. */
    async resolveProjectPipelineTarget(
        actor: ProjectAccessActor,
        projectId: string,
        bindingId: string,
        selectedWorkspaceId?: string
    ) {
        if (
            ![actor.tenantId, actor.organizationId, actor.userId, projectId, bindingId].every(
                (value) => z.string().uuid().safeParse(value).success
            )
        )
            throw invocationError('InvalidScope')
        await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({ actor, projectId })
        const project = await this.bindings.manager
            .getRepository(XpertProject)
            .findOneBy({ id: projectId, tenantId: actor.tenantId, organizationId: actor.organizationId })
        const binding = await this.bindings.findOneBy({
            id: bindingId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            enabled: true
        })
        const workspaceId =
            selectedWorkspaceId ?? (binding?.workspaceIds.length === 1 ? binding.workspaceIds[0] : undefined)
        if (
            !project ||
            !binding ||
            !z.string().uuid().safeParse(workspaceId).success ||
            !binding.workspaceIds.includes(workspaceId)
        )
            throw invocationError('InvalidScope')
        const workspace = await this.bindings.manager.findOneBy(XpertWorkspace, {
            id: workspaceId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId
        })
        if (!workspace || workspace.status === 'archived') throw invocationError('InvalidScope')
        this.assertPipelineTarget(binding.target, actor.organizationId)
        return { workspaceId, target: structuredClone(binding.target) }
    }

    /** Runtime grants expose selection metadata only, never credentials or authoring/file capabilities. */
    async listProjectPipelineBindings(
        actor: ProjectAccessActor,
        projectId: string
    ): Promise<NonNullable<ProjectPipelineCatalog['runtimeBindings']>> {
        await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage({ actor, projectId })
        if (
            ![actor.tenantId, actor.organizationId, actor.userId, projectId].every(
                (value) => z.string().uuid().safeParse(value).success
            )
        )
            throw invocationError('InvalidScope')
        const scope = { tenantId: actor.tenantId, organizationId: actor.organizationId }
        const bindings = await this.bindings.find({
            where: { ...scope, enabled: true },
            order: { title: 'ASC', id: 'ASC' }
        })
        const ids = [
            ...new Set(
                bindings
                    .flatMap((binding) => binding.workspaceIds)
                    .filter((id) => z.string().uuid().safeParse(id).success)
            )
        ]
        const workspaces = ids.length
            ? await this.bindings.manager.find(XpertWorkspace, {
                  where: { ...scope, id: In(ids) },
                  select: { id: true, name: true, status: true }
              })
            : []
        return bindings.flatMap((binding) => {
            try {
                this.assertPipelineTarget(binding.target, actor.organizationId)
            } catch (error) {
                if (
                    error instanceof AgentInvocationError &&
                    ['Unsupported', 'ProviderUnavailable'].includes(error.code)
                )
                    return []
                throw error
            }
            const permitted = workspaces
                .filter((workspace) => workspace.status !== 'archived' && binding.workspaceIds.includes(workspace.id))
                .map((workspace) => ({ id: workspace.id, name: workspace.name }))
            return permitted.length
                ? [
                      {
                          id: binding.id,
                          title: binding.title,
                          provider: binding.target.provider,
                          revision: binding.target.revision,
                          workspaces: permitted
                      }
                  ]
                : []
        })
    }

    private assertPipelineTarget(target: AgentTarget, organizationId: string) {
        this.runtime.assertBackgroundTarget(target, organizationId)
        if (
            z
                .object({ type: z.literal('computer') })
                .passthrough()
                .safeParse(target.configuration.executionEnvironment).success
        )
            throw invocationError('Unsupported')
    }

    async resolveGroupTarget(scope: AgentInvocationScope, participantId: string): Promise<AgentTarget> {
        if (!this.commands) throw invocationError('Unsupported')
        const target = await this.commands.execute(new ResolveGroupTaskTargetCommand(scope, participantId))
        this.runtime.assertBackgroundTarget(target, scope.organizationId)
        return target
    }

    async listProjectBindings(scope: AgentInvocationScope) {
        const bindings = await this.bindings.find({
            where: {
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                enabled: true
            },
            order: { title: 'ASC' }
        })
        const candidates = bindings.filter((binding) => binding.workspaceIds.includes(scope.workspaceId))
        const items: Array<
            { bindingId: string; title: string; provider: string; revision: string } | GroupTaskTargetItem
        > = this.commands ? await this.commands.execute(new ListGroupTaskTargetsCommand(scope)) : []
        for (const binding of candidates) {
            const target = await this.createCapturedApi(scope).resolve(binding.id)
            items.push({
                bindingId: binding.id,
                title: binding.title,
                provider: target.provider,
                revision: target.revision
            })
        }
        return items
    }

    createScopedApi(identity: RuntimeIdentityScope): AgentInvocationApi {
        return this.createApi(identity)
    }

    private createApi(identity: RuntimeIdentityScope, captured?: AgentInvocationScope): AgentInvocationApi {
        identity = { ...identity }
        const currentScope = (): AgentInvocationScope => {
            if (captured) return structuredClone(captured)
            const bound = resolveAgentExecutionScope(identity)
            return {
                tenantId: bound.tenantId ?? RequestContext.currentTenantId(),
                organizationId: bound.organizationId ?? RequestContext.getOrganizationId(),
                userId: bound.userId ?? RequestContext.currentUserId(),
                workspaceId: bound.workspaceId ?? undefined,
                projectId: bound.projectId ?? undefined,
                conversationId: bound.conversationId ?? undefined,
                parentExecutionId: bound.executionId,
                callerAgentKey: bound.agentKey,
                callerXpertId: bound.xpertId
            }
        }
        const resolve = async (bindingId: string): Promise<AgentTarget> => {
            if (!z.string().uuid().safeParse(bindingId).success) throw invocationError('InvalidRequest')
            const scope = currentScope()
            if (
                !scope.tenantId ||
                !scope.organizationId ||
                !scope.userId ||
                (!['project_agent', 'project_pipeline'].includes(scope.callerType) && !scope.callerXpertId)
            ) {
                throw invocationError('InvalidScope')
            }
            if (scope.projectId)
                await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({
                    actor: { userId: scope.userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                    projectId: scope.projectId
                })
            if (scope.pipelineOrigin && scope.callerType !== 'project_pipeline') throw invocationError('InvalidScope')
            if (scope.callerType === 'project_pipeline') {
                const parsed = projectPipelineInvocationScopeSchema.safeParse(scope)
                if (!parsed.success || !this.commands) throw invocationError('InvalidScope')
                await this.commands.execute(new AuthorizeProjectPipelineRuntimeCommand(parsed.data, bindingId))
            } else if (scope.callerType === 'project_agent') {
                if (!scope.projectId || scope.callerXpertId || scope.callerAgentKey !== 'general_agent')
                    throw invocationError('InvalidScope')
                const project = await this.bindings.manager.getRepository(XpertProject).findOneBy({
                    id: scope.projectId,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    workspaceId: scope.workspaceId
                })
                if (!project || !scope.workspaceId) throw invocationError('InvalidScope')
            } else {
                const { agent } = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                    new GetXpertWorkflowQuery(scope.callerXpertId)
                )
                if (
                    agent?.team?.tenantId !== scope.tenantId ||
                    agent.team.organizationId !== scope.organizationId ||
                    agent.team.workspaceId !== scope.workspaceId
                )
                    throw invocationError('InvalidScope')
            }
            const binding = await this.bindings.findOneBy({
                id: bindingId,
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                enabled: true
            })
            if (!binding || !binding.workspaceIds.includes(scope.workspaceId)) throw invocationError('NotFound')
            if (scope.callerType === 'project_pipeline') {
                this.assertPipelineTarget(binding.target, scope.organizationId)
            }
            return structuredClone(binding.target)
        }
        const api = () => {
            const scope = Object.freeze(currentScope())
            const scoped = new DefaultRuntimeCapabilityRegistry()
            const factory = this.capabilities.get(AgentExecutionRunnerFactoryCapability)
            if (factory) scoped.register(AgentExecutionRunnerCapability, factory.createScopedRunner(scope))
            return this.runtime.scoped({
                scope,
                // Group/Project schedulers own accepted work; phase 2 does not replace their control protocol.
                controlPolicy: (target) =>
                    assistantTaskGroupContext(target) ||
                    scope.callerType === 'project_agent' ||
                    scope.callerType === 'project_pipeline'
                        ? 'detached'
                        : 'attached',
                capabilities: scoped,
                authorize: async (target) => {
                    const group = assistantTaskGroupContext(target)
                    const allowed = group
                        ? await this.resolveGroupTarget(scope, target.bindingId)
                        : await resolve(target.bindingId)
                    if (
                        allowed.revision !== target.revision ||
                        allowed.provider !== target.provider ||
                        allowed.reference !== target.reference ||
                        !sameInvocationData(allowed.configuration, target.configuration)
                    ) {
                        throw invocationError('CallConflict')
                    }
                    if (group) {
                        if (!this.commands) throw invocationError('Unsupported')
                        scoped.register(AssistantTaskExecution, {
                            start: (request, context) =>
                                this.commands.execute(new ExecuteGroupTaskCommand({ type: 'start', request }, context)),
                            inspect: (handle, context) =>
                                this.commands.execute(
                                    new ExecuteGroupTaskCommand({ type: 'inspect', handle }, context)
                                ),
                            cancel: (handle, context) =>
                                this.commands.execute(new ExecuteGroupTaskCommand({ type: 'cancel', handle }, context))
                        })
                    }
                }
            })
        }
        const existingApi = async (id: string) => {
            const scope = currentScope()
            if (!captured && scope.projectId && this.records && z.string().uuid().safeParse(id).success) {
                const record = await this.records.findOneBy({
                    id,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    ownerId: scope.userId
                })
                const previous = record?.invocation.scope
                const dispatch = agentInvocationDispatchContextSchema.safeParse(record?.invocation.request.dispatch)
                if (
                    record?.invocation.id === id &&
                    previous &&
                    dispatch.success &&
                    dispatch.data.projectTask?.projectId === scope.projectId &&
                    sameInvocationData({ ...previous, parentExecutionId: scope.parentExecutionId }, scope)
                ) {
                    // A Project attempt survives turns, but never crosses actor, conversation, workspace or Assistant scope.
                    return this.createCapturedApi(previous)
                }
            }
            return api()
        }
        const controls: AgentInvocationApi = {
            start: async (request) => {
                const scope = currentScope()
                if (scope.callerType === 'project_pipeline') {
                    // Authorize and launch one snapshot even if the caller retains a mutable request.
                    request = structuredClone(request)
                    const parsed = projectPipelineInvocationScopeSchema.safeParse(scope)
                    if (
                        !parsed.success ||
                        !this.commands ||
                        request.dispatch ||
                        request.callId !== parsed.data.pipelineOrigin.operationId
                    )
                        throw invocationError('InvalidRequest')
                    await this.commands.execute(
                        new AuthorizeProjectPipelineRuntimeCommand(
                            parsed.data,
                            request.target.bindingId,
                            'dispatch',
                            request
                        )
                    )
                }
                return api().start(request)
            },
            inspect: async (id) => (await existingApi(id)).inspect(id),
            cancel: async (id) => (await existingApi(id)).cancel(id),
            respond: async (id, interaction, response) => (await existingApi(id)).respond(id, interaction, response)
        }
        const claimResults = async (callId: string, tasks: AgentInvocation[]) => {
            const ids = tasks
                .filter((task) => task.request.dispatch && ['succeeded', 'failed', 'cancelled'].includes(task.status))
                .map((task) => task.id)
            if (ids.length) {
                if (!this.commands) throw invocationError('Unsupported')
                await this.commands.execute(new ClaimAgentRuntimeResultsCommand(currentScope(), callId, ids))
            }
        }
        return {
            resolve,
            getResourceCard: async (id) => {
                if (!this.records || !this.cards) return null
                const scope = currentScope()
                const row = await this.records.findOneBy({
                    id,
                    tenantId: scope.tenantId,
                    organizationId: scope.organizationId,
                    ownerId: scope.userId
                })
                if (!row || !sameInvocationData(row.invocation.scope, scope)) throw invocationError('NotFound')
                if (assistantTaskGroupContext(row.invocation.request.target))
                    await this.resolveGroupTarget(scope, row.invocation.request.target.bindingId)
                else await resolve(row.invocation.request.target.bindingId)
                return row.invocation.activity ? this.cards.createCard(row.invocation) : null
            },
            ...controls,
            awaitResult: async (id, options) => {
                const result = await awaitInvocationTasks(
                    controls,
                    {
                        callId: id,
                        taskIds: [id],
                        mode: 'all',
                        timeoutMs: options?.timeoutMs
                    },
                    options?.signal
                )
                await claimResults(id, result.tasks)
                return result.tasks[0]
            },
            waitForTasks: async (request, options) => {
                const result = await awaitInvocationTasks(controls, request, options?.signal)
                await claimResults(request.callId, result.tasks)
                return result
            }
        }
    }
}
