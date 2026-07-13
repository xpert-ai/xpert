import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { UserModule, UserOrganizationModule } from '@xpert-ai/server-core'
import { VolumeModule } from '../shared/volume'
import { XpertWorkspaceModule } from '../xpert-workspace'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'
import {
    ArtifactsManagementController,
    ArtifactsPublicController,
    ArtifactsShareSessionController
} from './artifacts.controller'
import { ArtifactsService } from './artifacts.service'

@Module({
    imports: [
        TypeOrmModule.forFeature([Artifact, ArtifactVersion, ArtifactLink, ArtifactAccessLog]),
        UserModule,
        UserOrganizationModule,
        XpertWorkspaceModule,
        VolumeModule
    ],
    controllers: [ArtifactsPublicController, ArtifactsShareSessionController, ArtifactsManagementController],
    providers: [ArtifactsService],
    exports: [ArtifactsService]
})
export class ArtifactsModule {}
