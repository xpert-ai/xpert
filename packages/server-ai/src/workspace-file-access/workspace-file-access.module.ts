import { Module } from '@nestjs/common'
import { RouterModule } from '@nestjs/core'
import { VolumeModule } from '../shared/volume'
import { WorkspaceFileAccessController } from './workspace-file-access.controller'
import { WorkspaceFileAccessGuard } from './workspace-file-access.guard'
import { WorkspaceFileAccessService } from './workspace-file-access.service'

@Module({
    imports: [RouterModule.register([{ path: '/workspace-files', module: WorkspaceFileAccessModule }]), VolumeModule],
    controllers: [WorkspaceFileAccessController],
    providers: [WorkspaceFileAccessService, WorkspaceFileAccessGuard],
    exports: [WorkspaceFileAccessService]
})
export class WorkspaceFileAccessModule {}
