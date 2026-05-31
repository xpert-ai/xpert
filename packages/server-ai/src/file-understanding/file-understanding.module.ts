import { StorageFileModule, TenantModule, UserModule } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { RouterModule } from '@nestjs/core'
import { TypeOrmModule } from '@nestjs/typeorm'
import { CommandHandlers } from './commands/handlers'
import { ConversationFileLink, FileArtifact, FileAsset, FileChunk, FileCitationAnchor, FileEmbedding } from './entities'
import { FileWorkspaceProjectionService } from './file-workspace-projection.service'
import { FileUnderstandingController } from './file-understanding.controller'
import { FileUnderstandingMiddleware } from './middlewares'
import { FileParsers } from './parsers'
import { QueryHandlers } from './queries/handlers'
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
        VolumeModule
    ],
    controllers: [FileUnderstandingController],
    providers: [
        FileWorkspaceProjectionService,
        FileUnderstandingMiddleware,
        ...FileParsers,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [TypeOrmModule, FileWorkspaceProjectionService]
})
export class FileUnderstandingModule {}
