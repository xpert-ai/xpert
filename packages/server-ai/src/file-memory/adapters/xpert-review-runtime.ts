import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { XpertService } from '../../xpert/xpert.service'
import { GetXpertChatModelQuery } from '../../xpert/queries/get-xpert-chat-model.query'
import { AssertProjectAssistantAccessCommand } from '../../xpert-project/commands/assert-project-assistant-access.command'
import { Injectable, ForbiddenException } from '@nestjs/common'
import { ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { FileMemoryXpertScope, FileMemoryReviewRuntime } from '../../plugins/file-memory/ports'
import { ReviewCandidate } from '../../plugins/file-memory/dream-review'

@Injectable()
export class XpertReviewRuntime extends FileMemoryReviewRuntime {
    constructor(
        private readonly xperts: XpertService,
        private readonly commands: CommandBus,
        private readonly queries: QueryBus
    ) {
        super()
    }
    async authorize(candidate: ReviewCandidate, actor: ManagedQueueJobContext) {
        const xpert = await this.xperts.findOneForRuntime(candidate.xpertId, {
            relations: ['copilotModel', 'agent', 'agent.copilotModel']
        })
        if (
            !xpert ||
            xpert.tenantId !== actor.tenantId ||
            (xpert.organizationId ?? null) !== (actor.organizationId ?? null)
        )
            throw new ForbiddenException()
        if (candidate.projectId)
            await this.commands.execute(new AssertProjectAssistantAccessCommand(candidate.projectId, xpert.id))
        else if (xpert.workspaceDataScope !== 'user') throw new ForbiddenException()
        const scope: FileMemoryXpertScope = {
            id: xpert.id,
            tenantId: actor.tenantId,
            organizationId: actor.organizationId,
            userId: actor.userId,
            workspaceDataScope: xpert.workspaceDataScope,
            projectId: candidate.projectId
        }
        return {
            scope,
            getModel: () =>
                this.queries.execute<GetXpertChatModelQuery, BaseChatModel>(
                    new GetXpertChatModelQuery(xpert, xpert.agent, {
                        threadId: candidate.conversationId,
                        usageCallback: () => undefined
                    })
                )
        }
    }
}
