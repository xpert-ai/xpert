import { agentRuntimeModelSourceSchema } from '@xpert-ai/contracts'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { Inject, Injectable, Optional } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
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
    ProjectAccessRuntimeCapability
} from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { resolveAgentExecutionScope } from '../shared/agent/middleware-runtime/execution-scope'
import { AgentRuntimeBindingEntity, AgentInvocationEntity } from './invocation.entity'
import { AgentInvocationRuntime, invocationError, sameInvocationData } from './invocation-runtime'
import { awaitInvocationTasks } from './invocation-task-wait'
import { z } from 'zod/v3'

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
        private readonly records?: Repository<AgentInvocationEntity>
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
        const items: Array<{ bindingId: string; title: string; provider: string; revision: string }> = []
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
                (scope.callerType !== 'project_agent' && !scope.callerXpertId)
            ) {
                throw invocationError('InvalidScope')
            }
            if (scope.projectId)
                await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({
                    actor: { userId: scope.userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                    projectId: scope.projectId
                })
            if (scope.callerType === 'project_agent') {
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
            return structuredClone(binding.target)
        }
        const api = () => {
            const scope = Object.freeze(currentScope())
            const scoped = new DefaultRuntimeCapabilityRegistry()
            const factory = this.capabilities.get(AgentExecutionRunnerFactoryCapability)
            if (factory) scoped.register(AgentExecutionRunnerCapability, factory.createScopedRunner(scope))
            return this.runtime.scoped({
                scope,
                capabilities: scoped,
                authorize: async (target) => {
                    const allowed = await resolve(target.bindingId)
                    if (
                        allowed.revision !== target.revision ||
                        allowed.provider !== target.provider ||
                        allowed.reference !== target.reference ||
                        !sameInvocationData(allowed.configuration, target.configuration)
                    ) {
                        throw invocationError('CallConflict')
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
            start: (request) => api().start(request),
            inspect: async (id) => (await existingApi(id)).inspect(id),
            cancel: async (id) => (await existingApi(id)).cancel(id),
            respond: async (id, interaction, response) => (await existingApi(id)).respond(id, interaction, response)
        }
        return {
            resolve,
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
                return result.tasks[0]
            },
            waitForTasks: async (request, options) => {
                const result = await awaitInvocationTasks(controls, request, options?.signal)
                return result
            }
        }
    }
}
