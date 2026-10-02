// Invariants: a bearer credential never outlives its owning execution or approved binding.
import { isDeepStrictEqual } from 'node:util'
import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ModelExecutionContext } from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../agent-invocation/invocation.entity'
import { executionError } from './execution-errors'
import { CliSession } from './execution.entity'

@Injectable()
export class ModelExecutionSourceService {
    constructor(
        @InjectRepository(CliSession) private readonly sessions: Repository<CliSession>,
        @InjectRepository(AgentInvocationEntity) private readonly invocations: Repository<AgentInvocationEntity>,
        @InjectRepository(AgentRuntimeBindingEntity) private readonly bindings: Repository<AgentRuntimeBindingEntity>
    ) {}

    async assertCurrent(context: ModelExecutionContext) {
        const where = {
            tenantId: context.tenantId,
            organizationId: context.runtimeOrganizationId,
            ownerId: context.actorUserId
        }
        if (context.billableUserId !== context.actorUserId) throw executionError('Denied')
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
            invocation.scope.callerXpertId !== context.xpertId ||
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
            !isDeepStrictEqual(binding.target, invocation.request.target)
        )
            throw executionError('Denied')
    }
}
