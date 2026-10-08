import {
    ShellModelExecutionSourceCapability,
    ProjectAccessRuntimeCapability,
    RuntimeCapabilityRegistry,
    XPERT_RUNTIME_CAPABILITIES_TOKEN
} from '@xpert-ai/plugin-sdk'
// Invariants: a bearer credential never outlives its owning execution or approved binding.
import { sameInvocationData } from '../agent-invocation/invocation-runtime'
import { parseInvocationModelSource } from './invocation-model-source'
import { Inject, Optional, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ModelExecutionContext, ModelExecutionSource } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../agent-invocation/invocation.entity'
import { executionError } from './execution-errors'
import { CliSession } from './execution.entity'

@Injectable()
export class ModelExecutionSourceService {
    constructor(
        @InjectRepository(CliSession) private readonly sessions: Repository<CliSession>,
        @InjectRepository(AgentInvocationEntity) private readonly invocations: Repository<AgentInvocationEntity>,
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>,
        @Optional() @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities?: RuntimeCapabilityRegistry
    ) {}

    /** Resolve only a persisted project caller's administrator-approved model policy source. */
    async invocationModelSource(
        actor: { tenantId: string; organizationId: string; userId: string },
        conversationId: string,
        source: Extract<ModelExecutionSource, { type: 'agent_invocation' }>
    ) {
        const row = await this.invocations.findOneBy({
            id: source.invocationId,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            ownerId: actor.userId
        })
        if (!row || row.invocation.scope.conversationId !== conversationId) throw executionError('Denied')
        if (row.invocation.scope.callerType !== 'project_agent') return undefined
        const scope = row.invocation.scope
        if (
            scope.userId !== actor.userId ||
            scope.tenantId !== actor.tenantId ||
            scope.organizationId !== actor.organizationId ||
            !scope.projectId ||
            !scope.workspaceId ||
            scope.callerXpertId ||
            row.invocation.request.target.bindingId !== source.bindingId ||
            row.invocation.request.target.revision !== source.bindingRevision
        )
            throw executionError('Denied')
        await this.capabilities
            ?.require(ProjectAccessRuntimeCapability)
            .assertEdit({ actor, projectId: scope.projectId })
        if (!this.capabilities) throw executionError('Denied')
        const modelSource = parseInvocationModelSource(row.invocation.request.target.configuration.modelSource)
        return { id: modelSource.xpertId, workspaceId: scope.workspaceId }
    }

    async assertCurrent(context: ModelExecutionContext, preparing = false) {
        const where = {
            tenantId: context.tenantId,
            organizationId: context.runtimeOrganizationId,
            ownerId: context.actorUserId
        }
        if (context.billableUserId !== context.actorUserId) throw executionError('Denied')
        if (context.source.type === 'shell_execution') {
            const guard = this.capabilities?.get(ShellModelExecutionSourceCapability)
            if (!guard) throw executionError('Denied')
            return guard.assertCurrent(context, preparing)
        }
        if (context.source.type === 'cli_session') {
            const session = await this.sessions.findOneBy({
                ...where,
                id: context.source.cliSessionId,
                conversationId: context.conversationId,
                xpertId: context.xpertId
            })
            if (
                !session ||
                !['starting', 'running'].includes(session.status) ||
                session.tool.id !== context.tool.id ||
                session.tool.version !== context.tool.version
            )
                throw executionError('Denied')
            if (
                session.runner &&
                (context.environment.type === 'remote' ||
                    session.runner.environmentId !== context.environment.environmentId ||
                    session.runner.instanceId !== context.environment.instanceId)
            )
                throw executionError('Denied')
            return
        }
        const row = await this.invocations.findOneBy({ ...where, id: context.source.invocationId })
        const invocation = row?.invocation
        if (
            !invocation ||
            !['queued', 'running', 'waiting'].includes(invocation.status) ||
            invocation.scope.conversationId !== context.conversationId ||
            (invocation.scope.callerType === 'project_agent'
                ? parseInvocationModelSource(invocation.request.target.configuration.modelSource).xpertId !==
                  context.xpertId
                : invocation.scope.callerXpertId !== context.xpertId) ||
            invocation.request.target.bindingId !== context.source.bindingId ||
            invocation.request.target.revision !== context.source.bindingRevision
        )
            throw executionError('Denied')
        const binding = await this.bindings.findOneBy({
            id: context.source.bindingId,
            tenantId: context.tenantId,
            organizationId: context.runtimeOrganizationId,
            enabled: true
        })
        if (
            !binding ||
            !binding.workspaceIds.includes(invocation.scope.workspaceId) ||
            binding.target.revision !== context.source.bindingRevision ||
            !sameInvocationData(binding.target, invocation.request.target)
        )
            throw executionError('Denied')
    }
}
