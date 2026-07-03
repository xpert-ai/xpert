import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { FileArtifact, FileAsset, FileChunk, FileCitationAnchor, FileEmbedding } from '../../entities'
import { FileUnderstandingVectorService } from '../../file-understanding-vector.service'
import { CreateFileArtifactsCommand } from '../create-file-artifacts.command'

@CommandHandler(CreateFileArtifactsCommand)
export class CreateFileArtifactsHandler implements ICommandHandler<CreateFileArtifactsCommand> {
    constructor(
        @InjectRepository(FileAsset)
        private readonly fileAssetRepository: Repository<FileAsset>,
        @InjectRepository(FileArtifact)
        private readonly fileArtifactRepository: Repository<FileArtifact>,
        @InjectRepository(FileChunk)
        private readonly fileChunkRepository: Repository<FileChunk>,
        @InjectRepository(FileCitationAnchor)
        private readonly fileCitationAnchorRepository: Repository<FileCitationAnchor>,
        @InjectRepository(FileEmbedding)
        private readonly fileEmbeddingRepository: Repository<FileEmbedding>,
        private readonly fileVectorService: FileUnderstandingVectorService
    ) {}

    async execute(command: CreateFileArtifactsCommand) {
        const asset = await this.fileAssetRepository.findOne({ where: { id: command.fileAssetId } })
        await this.fileVectorService.deleteFileVectors(command.fileAssetId, asset)
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
