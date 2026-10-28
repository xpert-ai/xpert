import { ArtifactShareQueries } from './artifact-share-queries'
import { ArtifactReference } from './library/artifact-reference.entity'
import { ArtifactLibraryAccess } from './library/artifact-library-access'
import { ArtifactLibraryService } from './library/artifact-library.service'
import { ArtifactContentProvider } from './library/artifact-content.provider'
import { ArtifactLibraryViewService } from './library/artifact-library-view.service'
import { ArtifactLibraryController } from './library/artifact-library.controller'
import { ArtifactSnapshotsService } from './presentation/artifact-snapshots.service'
import { ArtifactSnapshotsController } from './presentation/artifact-snapshots.controller'
import { ArtifactTypesModule } from './types/artifact-types.module'
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
import { ContentResourceModule } from '../content-resource/content-resource.module'
import { ArtifactContentAccess } from './artifact-content-access'
import { XpertProjectAccessModule } from '../xpert-project/project-access.module'
import { DiscoveryModule } from '@nestjs/core'
import { ArtifactPresentationRegistry } from '@xpert-ai/plugin-sdk'
import { ArtifactPresentationService } from './presentation/artifact-presentation.service'
import { ArtifactPresentationController } from './presentation/artifact-presentation.controller'

@Module({
    imports: [
        ArtifactTypesModule,
        DiscoveryModule,
        RuntimeCapabilityModule,
        ContentResourceModule,
        XpertProjectAccessModule,
        WorkspaceFilesRuntimeModule,
        TypeOrmModule.forFeature([
            Artifact,
            ArtifactDraft,
            ArtifactVersion,
            ArtifactLink,
            ArtifactAccessLog,
            ArtifactReference
        ]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [
        ArtifactLibraryController,
        ArtifactsPublicController,
        ArtifactsShareSessionController,
        ArtifactsManagementController,
        ArtifactPresentationController,
        ArtifactSnapshotsController
    ],
    providers: [
        ArtifactLibraryAccess,
        ArtifactLibraryService,
        ArtifactContentProvider,
        ArtifactLibraryViewService,
        ArtifactsService,
        ArtifactShareQueries,
        ArtifactContentAccess,
        ArtifactDraftsService,
        ArtifactPresentationRegistry,
        ArtifactPresentationService,
        ArtifactSnapshotsService
    ],
    exports: [ArtifactsService, ArtifactShareQueries, ArtifactSnapshotsService]
})
export class ArtifactsModule {}
