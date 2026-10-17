import { ArtifactDraft } from './drafts/artifact-draft.entity'
import { ArtifactDraftsService } from './drafts/artifact-drafts.service'
import { WorkspaceFilesRuntimeModule } from '../shared/runtime/workspace-files-runtime.module'
import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { VolumeModule } from '../shared/volume'
import { XpertWorkspaceModule } from '../xpert-workspace/workspace.module'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'
import {
    ArtifactsManagementController,
    ArtifactsPublicController,
    ArtifactsShareSessionController
} from './artifacts.controller'
import { ArtifactsService } from './artifacts.service'
import { RuntimeCapabilityModule } from '../shared/runtime/runtime-capability.module'

@Module({
    imports: [
        RuntimeCapabilityModule,
        WorkspaceFilesRuntimeModule,
        TypeOrmModule.forFeature([Artifact, ArtifactDraft, ArtifactVersion, ArtifactLink, ArtifactAccessLog]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [ArtifactsPublicController, ArtifactsShareSessionController, ArtifactsManagementController],
    providers: [ArtifactsService, ArtifactDraftsService],
    exports: [ArtifactsService]
})
export class ArtifactsModule {}
