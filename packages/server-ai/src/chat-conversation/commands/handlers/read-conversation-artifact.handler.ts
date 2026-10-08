import { NotFoundException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { SecretTokenBindingType } from '@xpert-ai/contracts'
import { assertWorkbenchPrincipal } from '../../../ai/workbench-principal'
import { CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { t } from 'i18next'
import { ArtifactsService } from '../../../artifacts/artifacts.service'
import { ChatMessageService } from '../../../chat-message/chat-message.service'
import { extractChatMessageTaskSummary, isCompletedOpenableTaskSummaryOutput } from '../../../chat-message/task-summary'
import { assertPublicXpertSessionConversationAccess } from '../../../ai/public-xpert-principal'
import { ChatConversationService } from '../../conversation.service'
import {
    ReadConversationArtifactCommand,
    type ConversationArtifactContent
} from '../read-conversation-artifact.command'

@CommandHandler(ReadConversationArtifactCommand)
export class ReadConversationArtifactHandler implements ICommandHandler<ReadConversationArtifactCommand> {
    constructor(
        private readonly conversations: ChatConversationService,
        private readonly messages: ChatMessageService,
        private readonly artifacts: ArtifactsService,
        private readonly queryBus: QueryBus
    ) {}

    async execute({ conversationId, ref }: ReadConversationArtifactCommand): Promise<ConversationArtifactContent> {
        const conversation = await this.conversations.assertAccess(conversationId, 'read')
        await assertPublicXpertSessionConversationAccess(conversation, this.queryBus)
        const principal = RequestContext.currentApiPrincipal()
        // Public/enterprise sessions use the family-aware check above; delegated user
        // sessions and API keys must also stay within their exact Assistant binding.
        if (
            principal &&
            principal.clientSecretBindingType !== SecretTokenBindingType.PUBLIC_XPERT &&
            principal.clientSecretBindingType !== SecretTokenBindingType.ENTERPRISE_XPERT
        ) {
            assertWorkbenchPrincipal(principal, conversation)
        }
        const matches = (candidate: typeof ref) =>
            candidate.artifactId === ref.artifactId && candidate.artifactVersionId === ref.artifactVersionId
        // A summary may combine endpoints from different messages; check the original contributions,
        // including older versions, rather than just the latest summary or a mutable workspace path.
        const pageSize = 100
        for (let skip = 0; ; skip += pageSize) {
            const page = await this.messages.findAllInOrganizationOrTenant({
                where: { conversationId: conversation.id },
                select: ['id', 'content', 'taskSummary', 'createdAt', 'updatedAt'],
                order: { createdAt: 'ASC', id: 'ASC' },
                skip,
                take: pageSize
            })
            for (const message of page.items) {
                const summary = extractChatMessageTaskSummary(message)
                const delivery = summary.outputs?.some(
                    (output) =>
                        isCompletedOpenableTaskSummaryOutput(output) &&
                        output.resource?.type === 'artifact' &&
                        output.resource.artifactVersionId &&
                        matches({
                            artifactId: output.resource.artifactId,
                            artifactVersionId: output.resource.artifactVersionId
                        })
                )
                const review = summary.fileChanges?.some(
                    ({ resource }) => resource && (matches(resource.first) || matches(resource.last))
                )
                if (delivery || review) {
                    // This independently enforces tenant/organization/user ownership, version status and SHA-256.
                    const resolved = await this.artifacts.resolveForManagementAccess(ref)
                    if (
                        !delivery &&
                        (resolved.artifact.pluginName !== 'platform.file-activity' ||
                            resolved.artifact.resourceType !== 'file-change')
                    )
                        throw this.unavailable()
                    return { buffer: resolved.buffer, mimeType: resolved.mimeType, fileName: resolved.fileName }
                }
            }
            if (page.items.length < pageSize) throw this.unavailable()
        }
    }

    private unavailable() {
        return new NotFoundException(t('server-ai:Error.ConversationArtifactUnavailable'))
    }
}
