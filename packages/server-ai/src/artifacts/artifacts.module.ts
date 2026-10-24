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

@Module({
    imports: [
        RuntimeCapabilityModule,
        ContentResourceModule,
        XpertProjectAccessModule,
        TypeOrmModule.forFeature([Artifact, ArtifactVersion, ArtifactLink, ArtifactAccessLog]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [ArtifactsPublicController, ArtifactsShareSessionController, ArtifactsManagementController],
    providers: [ArtifactsService, ArtifactContentAccess],
    exports: [ArtifactsService]
})
export class ArtifactsModule {}
