import { projectPipelineInvocationScopeSchema } from '@xpert-ai/plugin-sdk'
import { AuthorizeProjectPipelineRuntimeCommand } from '../../xpert-project/pipeline/runtime/pipeline-runtime-access.command'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ResolveGroupTaskTargetCommand } from '../../chat-group/group-project/group-task.commands'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { assistantTaskGroupContext, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { AgentInvocationEntity, AgentRuntimeBindingEntity } from '../invocation.entity'
import { invocationError } from '../invocation-runtime'

/** View Host authorizes the host/conversation; this layer authorizes the exact private invocation. */
@Injectable()
export class ExecutionReaderService {
    constructor(
        @InjectRepository(AgentInvocationEntity) private readonly records: Repository<AgentInvocationEntity>,
        private readonly commands: CommandBus
    ) {}
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
        if (scope.callerType === 'project_pipeline') {
            const parsed = projectPipelineInvocationScopeSchema.safeParse(scope)
            if (!parsed.success) throw invocationError('NotFound')
            await this.commands.execute(
                new AuthorizeProjectPipelineRuntimeCommand(parsed.data, row.invocation.request.target.bindingId)
            )
        }
        if (assistantTaskGroupContext(row.invocation.request.target)) {
            await this.commands.execute(
                new ResolveGroupTaskTargetCommand(scope, row.invocation.request.target.bindingId)
            )
            return row.invocation
        }
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
