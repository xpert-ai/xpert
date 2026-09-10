import { Module } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { VolumeModule } from '../volume/volume.module'
import { RuntimeCapabilityModule } from './runtime-capability.module'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'

// File consumers import this module directly; no Agent runtime is required.
@Module({
    imports: [CqrsModule, RuntimeCapabilityModule, VolumeModule],
    providers: [WorkspaceFilesRuntimeCapabilityService],
    exports: [WorkspaceFilesRuntimeCapabilityService]
})
export class WorkspaceFilesRuntimeModule {}
