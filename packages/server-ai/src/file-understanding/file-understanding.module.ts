import { StorageFileModule, TenantModule, UserModule } from '@xpert-ai/server-core'
import { forwardRef, Module } from '@nestjs/common'
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
import { XpertProject } from '../xpert-project/entities/project.entity'
import { FileAssetAccessService } from './file-asset-access.service'
import { ChatConversationModule } from '../chat-conversation'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { XpertModule } from '../xpert/xpert.module'

@Module({
    imports: [
        RouterModule.register([{ path: '/ai', module: FileUnderstandingModule }]),
        TypeOrmModule.forFeature([
            FileAsset,
            FileArtifact,
            FileChunk,
            FileCitationAnchor,
            FileEmbedding,
            ConversationFileLink,
            XpertProject
        ]),
        CqrsModule,
        TenantModule,
        UserModule,
        StorageFileModule,
        forwardRef(() => ChatConversationModule),
        XpertProjectAccessModule,
        forwardRef(() => XpertModule),
        RagVStoreModule,
        VolumeModule
    ],
    controllers: [FileUnderstandingController],
    providers: [
        FileUnderstandingVectorService,
        FileWorkspaceProjectionService,
        FileAssetAccessService,
        FileUnderstandingMiddleware,
        ...FileParsers,
        ...CommandHandlers,
        ...QueryHandlers
    ],
    exports: [TypeOrmModule, FileUnderstandingVectorService, FileWorkspaceProjectionService, FileAssetAccessService]
})
export class FileUnderstandingModule {}
