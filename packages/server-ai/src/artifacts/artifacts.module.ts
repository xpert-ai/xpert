import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { VolumeModule } from '../shared/volume'
import { Artifact, ArtifactAccessLog, ArtifactLink, ArtifactVersion } from './entities'
import { ArtifactsManagementController, ArtifactsPublicController } from './artifacts.controller'
import { ArtifactsService } from './artifacts.service'

@Module({
    imports: [TypeOrmModule.forFeature([Artifact, ArtifactVersion, ArtifactLink, ArtifactAccessLog]), VolumeModule],
    controllers: [ArtifactsPublicController, ArtifactsManagementController],
    providers: [ArtifactsService],
    exports: [ArtifactsService]
})
export class ArtifactsModule {}
