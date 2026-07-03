import { StorageFileModule, TenantModule, UserModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CommandHandlers } from './commands/handlers'
import { ConversationFileLink, FileArtifact, FileAsset, FileChunk, FileCitationAnchor, FileEmbedding } from './entities'
import { FileUnderstandingVectorService } from './file-understanding-vector.service'
import { FileWorkspaceProjectionService } from './file-workspace-projection.service'
import { FileUnderstandingController } from './file-understanding.controller'
import { FileUnderstandingMiddleware } from './middlewares'
import { FileParsers } from './parsers'
import { QueryHandlers } from './queries/handlers'
import { RagVStoreModule } from '../rag-vstore'
import { VolumeModule } from '../shared/volume'

@Module({
    imports: [
        RouterModule.register([{ path: '/ai', module: FileUnderstandingModule }]),
        TypeOrmModule.forFeature([
            FileAsset,
            FileArtifact,
            FileChunk,
            FileCitationAnchor,
            FileEmbedding,
            ConversationFileLink
        ]),
        CqrsModule,
        TenantModule,
        UserModule,
        StorageFileModule,
        RagVStoreModule,
        VolumeModule
    ],
    controllers: [FileUnderstandingController],
    providers: [
        FileUnderstandingVectorService,
        FileWorkspaceProjectionService,
        FileUnderstandingMiddleware,
        ...FileParsers,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [TypeOrmModule, FileUnderstandingVectorService, FileWorkspaceProjectionService]
})
export class FileUnderstandingModule {}
