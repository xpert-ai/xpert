import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { ResolveExecutionIdentityCommand, runWithExecutionIdentity } from '@xpert-ai/server-core'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { FileMemoryDreamModel, FileMemoryXpertScope } from '../../plugins/file-memory/ports'
import { GetXpertChatModelQuery } from '../../xpert/queries/get-xpert-chat-model.query'
import { XpertService } from '../../xpert/xpert.service'

@Injectable()
export class XpertDreamModel implements FileMemoryDreamModel {
    constructor(
        private readonly xperts: XpertService,
        private readonly queries: QueryBus,
        private readonly commands: CommandBus
    ) {}

    async withActor<T>(scope: FileMemoryXpertScope, work: () => Promise<T>) {
        if (
            !scope.userId ||
            RequestContext.currentUserId() !== scope.userId ||
            RequestContext.currentTenantId() !== scope.tenantId ||
            (RequestContext.getOrganizationId() ?? null) !== (scope.organizationId ?? null)
        )
            throw new ForbiddenException()
        // A bound client keeps its original delegated audience. Never elevate it to an ordinary user.
        if (RequestContext.currentApiPrincipal()) return work()
        const identity = await this.commands.execute(
            new ResolveExecutionIdentityCommand({
                tenantId: scope.tenantId,
                organizationId: scope.organizationId,
                userId: scope.userId,
                kind: 'user'
            })
        )
        return runWithExecutionIdentity(identity, work)
    }

    async resolve(scope: FileMemoryXpertScope, runId: string) {
        const assistant = await this.xperts.findOneForRuntime(scope.id, {
            relations: ['agent', 'agent.copilotModel', 'copilotModel']
        })
        if (
            assistant.tenantId !== scope.tenantId ||
            (assistant.organizationId && assistant.organizationId !== scope.organizationId)
        )
            throw new ForbiddenException()
        const selected = assistant.agent?.copilotModel ?? assistant.copilotModel
        if (!assistant.agent || !selected?.model)
            throw new BadRequestException(
                'Configure and publish the primary agent model in Studio before running Dream.'
            )
        const model = await this.queries.execute<GetXpertChatModelQuery, BaseChatModel>(
            new GetXpertChatModelQuery(assistant, assistant.agent, {
                copilotModel: selected,
                threadId: runId.slice('dream_'.length),
                usageCallback: () => undefined
            })
        )
        return { model, name: selected.model }
    }
}
