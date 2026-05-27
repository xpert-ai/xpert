import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
    ConversationFileLink,
    FileArtifact,
    FileAsset,
    FileChunk,
    FileCitationAnchor,
    FileEmbedding
} from '../../entities'
import { DeleteFileAssetCommand } from '../delete-file-asset.command'

@CommandHandler(DeleteFileAssetCommand)
export class DeleteFileAssetHandler implements ICommandHandler<DeleteFileAssetCommand> {
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
        @InjectRepository(ConversationFileLink)
        private readonly conversationFileLinkRepository: Repository<ConversationFileLink>
    ) {}

    async execute(command: DeleteFileAssetCommand) {
        await this.fileCitationAnchorRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileEmbeddingRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileChunkRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileArtifactRepository.delete({ fileAssetId: command.fileAssetId })
        await this.conversationFileLinkRepository.delete({ fileAssetId: command.fileAssetId })
        await this.fileAssetRepository.delete({ id: command.fileAssetId })
    }
}
