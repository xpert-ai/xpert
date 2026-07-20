import { Logger } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { ConversationFileLink, FileAsset } from '../../entities'
import { FileWorkspaceProjectionService } from '../../file-workspace-projection.service'
import { AttachFileToConversationCommand } from '../attach-file-to-conversation.command'

@CommandHandler(AttachFileToConversationCommand)
export class AttachFileToConversationHandler implements ICommandHandler<AttachFileToConversationCommand> {
    readonly #logger = new Logger(AttachFileToConversationHandler.name)

    constructor(
        @InjectRepository(ConversationFileLink)
        private readonly repository: Repository<ConversationFileLink>,
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        private readonly projectionService: FileWorkspaceProjectionService
    ) {}

    async execute(command: AttachFileToConversationCommand) {
        const { input } = command
        // The link is the read-permission boundary for file tools: tools list and
        // search only files attached to the active conversation.
        const existing = await this.repository.findOne({
            where: {
                conversationId: input.conversationId,
                fileAssetId: input.fileAssetId
            }
        })
        const link = await this.repository.save(
            this.repository.create({
                ...(existing ?? {}),
                tenantId: RequestContext.currentTenantId() ?? existing?.tenantId,
                organizationId: RequestContext.getOrganizationId() ?? existing?.organizationId,
                conversationId: input.conversationId,
                fileAssetId: input.fileAssetId,
                storageFileId: input.storageFileId ?? existing?.storageFileId,
                threadId: input.threadId ?? existing?.threadId,
                metadata: {
                    ...(existing?.metadata ?? {}),
                    ...(input.metadata ?? {})
                }
            })
        )
        const fileAssetPatch: Partial<FileAsset> = {
            conversationId: input.conversationId
        }
        if (input.threadId) {
            fileAssetPatch.threadId = input.threadId
        }
        if (input.projectId) {
            fileAssetPatch.projectId = input.projectId
        }
        if (input.xpertId) {
            fileAssetPatch.xpertId = input.xpertId
        }
        await this.fileAssetRepository.update({ id: input.fileAssetId }, fileAssetPatch)
        // Best-effort projection gives shell/sandbox_file-capable agents a stable
        // workspacePath without blocking the normal parsed-file tool path.
        await this.projectionService
            .projectFileAsset({
                fileAssetId: input.fileAssetId,
                storageFileId: input.storageFileId,
                conversationId: input.conversationId,
                threadId: input.threadId,
                projectId: input.projectId,
                xpertId: input.xpertId,
                environmentId: input.sandboxEnvironmentId,
                sandboxProvider: input.sandboxProvider
            })
            .catch((error) => {
                this.#logger.warn(
                    `Failed to project attached file ${input.fileAssetId}: ${
                        error instanceof Error ? error.message : String(error)
                    }`
                )
            })
        return link
    }
}
