import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { ArtifactTypeRegistry, FILE_ARTIFACT_TYPE } from '@xpert-ai/plugin-sdk'
import { ArtifactTypesService } from './artifact-types.service'
import { ArtifactTypeViews } from './artifact-type-views'
import { FileArtifactType } from './file-artifact.type'

@Module({
    imports: [DiscoveryModule],
    providers: [ArtifactTypeRegistry, ArtifactTypesService, ArtifactTypeViews, FileArtifactType],
    exports: [ArtifactTypeRegistry, ArtifactTypesService, ArtifactTypeViews]
})
export class ArtifactTypesModule {
    constructor(registry: ArtifactTypeRegistry, files: FileArtifactType) {
        registry.registerBuiltin(FILE_ARTIFACT_TYPE, files)
    }
}
