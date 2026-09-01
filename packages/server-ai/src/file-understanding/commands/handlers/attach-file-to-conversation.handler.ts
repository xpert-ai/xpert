import { ForbiddenException, Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { ConversationFileLink } from '../../entities'
import { FileAssetAccessService } from '../../file-asset-access.service'
import { FileWorkspaceProjectionService } from '../../file-workspace-projection.service'
import { AttachFileToConversationCommand } from '../attach-file-to-conversation.command'

@CommandHandler(AttachFileToConversationCommand)
export class AttachFileToConversationHandler implements ICommandHandler<AttachFileToConversationCommand> {
    readonly #logger = new Logger(AttachFileToConversationHandler.name)

    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly repository: Repository<ConversationFileLink>,
        private readonly projectionService: FileWorkspaceProjectionService,
        private readonly fileAssetAccessService: FileAssetAccessService
    ) {}

    async execute(command: AttachFileToConversationCommand) {
        const { input } = command
        const authorized = await this.fileAssetAccessService.resolve({
            locator: {
                fileAssetId: input.fileAssetId,
                storageFileId: input.storageFileId
            },
            authority: { kind: 'conversation', conversationId: input.conversationId },
            operation: 'attach'
        })
        const { asset, conversation } = authorized
        if (!conversation) {
            throw new ForbiddenException()
        }
        await this.fileAssetAccessService.assertConversationInputScope(conversation, input)
        await this.fileAssetAccessService.assertCanLinkToConversation(asset.id, conversation)
        // The link is the read-permission boundary for file tools: tools list and
        // search only files attached to the active conversation.
        const existing = await this.repository.findOne({
            where: {
                tenantId: conversation.tenantId,
                organizationId: conversation.organizationId ?? IsNull(),
                conversationId: conversation.id,
                fileAssetId: asset.id
            }
        })
        const link = await this.repository.save(
            this.repository.create({
                ...(existing ?? {}),
                tenantId: conversation.tenantId,
                organizationId: conversation.organizationId ?? existing?.organizationId,
                conversationId: conversation.id,
                fileAssetId: asset.id,
                storageFileId: asset.storageFileId ?? existing?.storageFileId,
                threadId: conversation.threadId ?? existing?.threadId,
                metadata: {
                    ...(existing?.metadata ?? {}),
                    ...(input.metadata ?? {})
                }
            })
        )
        // Best-effort projection gives shell/sandbox_file-capable agents a stable
        // workspacePath without blocking the normal parsed-file tool path.
        await this.projectionService
            .projectFileAsset({
                fileAssetId: asset.id,
                storageFileId: asset.storageFileId,
                conversationId: conversation.id,
                threadId: conversation.threadId,
                projectId: conversation.projectId,
                xpertId: conversation.xpertId,
                environmentId: input.sandboxEnvironmentId,
                sandboxProvider: input.sandboxProvider
            })
            .catch((error) => {
                this.#logger.warn(
                    `Failed to project attached file ${asset.id}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            })
        return link
    }
}
