import { Inject, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    AgentInvocationApi,
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
import { AgentRuntimeBindingEntity } from './invocation.entity'
import { AgentInvocationRuntime, invocationError } from './invocation-runtime'
import { awaitInvocationTasks } from './invocation-task-wait'
import { z } from 'zod/v3'
import { isDeepStrictEqual } from 'node:util'

@Injectable()
@RuntimeCapabilityProvider(AgentRuntimeFactoryCapability)
export class AgentInvocationFactoryService implements AgentRuntimeFactory {
    constructor(
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>,
        private readonly queries: QueryBus,
        private readonly runtime: AgentInvocationRuntime,
        @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry
    ) {}

    createScopedApi(identity: RuntimeIdentityScope): AgentInvocationApi {
        identity = { ...identity }
        const currentScope = (): AgentInvocationScope => {
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
            if (!scope.tenantId || !scope.organizationId || !scope.userId || !identity.xpertId) {
                throw invocationError('InvalidScope')
            }
            if (scope.projectId)
                await this.capabilities.require(ProjectAccessRuntimeCapability).assertEdit({
                    actor: { userId: scope.userId, tenantId: scope.tenantId, organizationId: scope.organizationId },
                    projectId: scope.projectId
                })
            const { agent } = await this.queries.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(scope.callerXpertId)
            )
            if (
                agent?.team?.tenantId !== scope.tenantId ||
                agent.team.organizationId !== scope.organizationId ||
                agent.team.workspaceId !== scope.workspaceId
            )
                throw invocationError('InvalidScope')
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
            const scope = currentScope()
            const scoped = new DefaultRuntimeCapabilityRegistry()
            return this.runtime.scoped({
                scope,
                capabilities: scoped,
                authorize: async (target) => {
                    const allowed = await resolve(target.bindingId)
                    if (
                        allowed.revision !== target.revision ||
                        allowed.provider !== target.provider ||
                        allowed.reference !== target.reference ||
                        !isDeepStrictEqual(allowed.configuration, target.configuration)
                    ) {
                        throw invocationError('CallConflict')
                    }
                }
            })
        }
        return {
            resolve,
            start: (request) => api().start(request),
            inspect: (id) => api().inspect(id),
            cancel: (id) => api().cancel(id),
            respond: (id, interaction, response) => api().respond(id, interaction, response),
            awaitResult: async (id, options) => {
                const result = await awaitInvocationTasks(
                    api(),
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
            waitForTasks: (request, options) => awaitInvocationTasks(api(), request, options?.signal)
        }
    }
}
