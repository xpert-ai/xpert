import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../invocation.entity'
import { invocationError } from '../invocation-runtime'

/** View Host authorizes the host/conversation; this layer authorizes the exact private invocation. */
@Injectable()
export class ExecutionReaderService {
    constructor(@InjectRepository(AgentInvocationEntity) private readonly records: Repository<AgentInvocationEntity>) {}
    async read(context: XpertResolvedViewHostContext, id: string) {
        if (
            !['agent', 'project'].includes(context.hostType) ||
            !context.userId ||
            !context.tenantId ||
            !context.organizationId ||
            !z.string().uuid().safeParse(id).success
        )
            throw invocationError('NotFound')
        const row = await this.records.findOneBy({
            id,
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            ownerId: context.userId
        })
        const scope = row?.invocation.scope
        const projectId =
            context.hostType === 'project' ? context.hostId : (context.runtimeScope?.projectId ?? undefined)
        if (
            !scope ||
            scope.userId !== context.userId ||
            scope.tenantId !== context.tenantId ||
            scope.organizationId !== context.organizationId ||
            scope.projectId !== projectId ||
            (context.hostType === 'agent' && scope.callerXpertId !== context.hostId) ||
            (context.runtimeScope?.conversationId && scope.conversationId !== context.runtimeScope.conversationId)
        )
            throw invocationError('NotFound')
        // A disabled/deleted binding is explicit revocation. An uninstalled adapter is not a read dependency.
        const binding = await this.records.manager.getRepository(AgentRuntimeBindingEntity).findOneBy({
            id: row.invocation.request.target.bindingId,
            tenantId: context.tenantId,
            organizationId: context.organizationId,
            enabled: true
        })
        if (!binding || !binding.workspaceIds.includes(scope.workspaceId)) throw invocationError('NotFound')
        return row.invocation
    }
}
