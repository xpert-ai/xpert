import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from '@xpert-ai/server-core'
import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { CqrsModule } from '@nestjs/cqrs'
import { VolumeModule } from '../shared/volume'
import { WorkspaceFileAccessController } from './workspace-file-access.controller'
import { WorkspaceFileContentController } from './workspace-file-content.controller'
import { WorkspaceFileAccessGuard } from './workspace-file-access.guard'
import { WorkspaceFileAccessService } from './workspace-file-access.service'
import { ImagePreviewService } from './image-preview/image-preview.service'

@Module({
    imports: [
        RouterModule.register([{ path: '/workspace-files', module: WorkspaceFileAccessModule }]),
        CqrsModule,
        TypeOrmModule.forFeature([User]),
        VolumeModule
    ],
    controllers: [WorkspaceFileAccessController, WorkspaceFileContentController],
    providers: [WorkspaceFileAccessService, WorkspaceFileAccessGuard, ImagePreviewService],
    exports: [WorkspaceFileAccessService, ImagePreviewService]
})
export class WorkspaceFileAccessModule {}
