import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileArtifact, FileChunk, FileCitationAnchor, FileEmbedding } from '../../entities'
import { CreateFileArtifactsCommand } from '../create-file-artifacts.command'

@CommandHandler(CreateFileArtifactsCommand)
export class CreateFileArtifactsHandler implements ICommandHandler<CreateFileArtifactsCommand> {
    constructor(
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        @InjectRepository(FileChunk)
        private readonly fileChunkRepository: Repository<FileChunk>,
        @InjectRepository(FileCitationAnchor)
        private readonly fileCitationAnchorRepository: Repository<FileCitationAnchor>,
        @InjectRepository(FileEmbedding)
        private readonly fileEmbeddingRepository: Repository<FileEmbedding>
    ) {}

    async execute(command: CreateFileArtifactsCommand) {
        await this.fileCitationAnchorRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileEmbeddingRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileChunkRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileArtifactRepository.delete({ fileAssetId: command.fileAssetId })

        return this.fileArtifactRepository.save(
            command.artifacts.map((artifact, index) =>
                this.fileArtifactRepository.create({
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId(),
                    fileAssetId: command.fileAssetId,
                    kind: artifact.kind,
                    orderNo: index,
                    mimeType: artifact.mimeType,
                    content: artifact.content,
                    anchor: artifact.anchor,
                    metadata: artifact.metadata
                })
            )
        )
    }
}
