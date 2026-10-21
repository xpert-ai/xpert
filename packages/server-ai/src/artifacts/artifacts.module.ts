import { ArtifactAnalyticsInventoryService } from './analytics-inventory/artifact-analytics-inventory.service'
import { ArtifactAnalyticsInventoryController } from './analytics-inventory/artifact-analytics-inventory.controller'
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
import { DiscoveryModule } from '@nestjs/core'
import { ArtifactPresentationRegistry } from '@xpert-ai/plugin-sdk'
import { ArtifactPresentationService } from './presentation/artifact-presentation.service'
import { ArtifactPresentationController } from './presentation/artifact-presentation.controller'

@Module({
    imports: [
        DiscoveryModule,
        RuntimeCapabilityModule,
        WorkspaceFilesRuntimeModule,
        TypeOrmModule.forFeature([Artifact, ArtifactDraft, ArtifactVersion, ArtifactLink, ArtifactAccessLog]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [
        ArtifactAnalyticsInventoryController,
        ArtifactsPublicController,
        ArtifactsShareSessionController,
        ArtifactsManagementController,
        ArtifactPresentationController
    ],
    providers: [
        ArtifactAnalyticsInventoryService,
        ArtifactsService,
        ArtifactDraftsService,
        ArtifactPresentationRegistry,
        ArtifactPresentationService
    ],
    exports: [ArtifactsService]
})
export class ArtifactsModule {}
