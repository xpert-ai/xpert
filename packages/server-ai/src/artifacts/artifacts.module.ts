import { ArtifactGroupContentService } from './group-references/artifact-group-content.service'
import { DiscoverGroupResourcesHandler } from './group-references/commands/handlers/discover-group-resources.handler'
import { GroupResourceAnalysisService } from './analysis/group-resource-analysis.service'
import { GroupResourceNavigationHandler } from './group-references/commands/handlers/group-resource-navigation.handler'
import { ResourceAnalysisAuthoringHandler } from './analysis/commands/handlers/resource-analysis-authoring.handler'
import { GroupResourceAnalysisHandler } from './analysis/commands/handlers/group-resource-analysis.handler'
import { GroupAnalysisStreamingHandler } from './analysis/commands/handlers/group-analysis-streaming.handler'
import { GroupAnalyticsBindingHandler } from './analysis/commands/handlers/group-analytics-binding.handler'
import { ResourceAnalysisExecution } from './analysis/resource-analysis-execution.entity'
import { ArtifactShareQueries } from './artifact-share-queries'
import { CqrsModule } from '@nestjs/cqrs'
import { ArtifactUseGrant, ArtifactUseGrantAudit } from './use-grants/artifact-use-grant.entity'
import { ArtifactUseGrantService } from './use-grants/artifact-use-grant.service'
import { ArtifactGroupReferenceService } from './group-references/artifact-group-reference.service'
import { ArtifactGroupViewService } from './group-references/artifact-group-view.service'
import { ArtifactUseGrantsController } from './group-references/artifact-use-grants.controller'
import { ArtifactUseGrantsRuntime } from './group-references/artifact-use-grants.runtime'
import { ArtifactContentRuntimeService } from './artifact-content-runtime.service'
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
import { AnalyticsModule, UserModule, UserOrganizationModule } from '@xpert-ai/server-core'
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
        CqrsModule,
        AnalyticsModule,
        ArtifactTypesModule,
        DiscoveryModule,
        RuntimeCapabilityModule,
        ContentResourceModule,
        XpertProjectAccessModule,
        WorkspaceFilesRuntimeModule,
        TypeOrmModule.forFeature([
            ResourceAnalysisExecution,
            Artifact,
            ArtifactDraft,
            ArtifactVersion,
            ArtifactLink,
            ArtifactAccessLog,
            ArtifactReference,
            ArtifactUseGrant,
            ArtifactUseGrantAudit
        ]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [
        ArtifactUseGrantsController,
        ArtifactLibraryController,
        ArtifactsPublicController,
        ArtifactsShareSessionController,
        ArtifactsManagementController,
        ArtifactPresentationController,
        ArtifactSnapshotsController
    ],
    providers: [
        DiscoverGroupResourcesHandler,
        ArtifactGroupContentService,
        GroupResourceAnalysisService,
        ResourceAnalysisAuthoringHandler,
        GroupResourceAnalysisHandler,
        GroupAnalysisStreamingHandler,
        GroupAnalyticsBindingHandler,
        GroupResourceNavigationHandler,
        ArtifactUseGrantsRuntime,
        ArtifactGroupReferenceService,
        ArtifactGroupViewService,
        ArtifactUseGrantService,
        ArtifactContentRuntimeService,
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
    exports: [
        ArtifactsService,
        ArtifactShareQueries,
        ArtifactSnapshotsService,
        ArtifactUseGrantService,
        ArtifactGroupReferenceService,
        ArtifactGroupViewService
    ]
})
export class ArtifactsModule {}
