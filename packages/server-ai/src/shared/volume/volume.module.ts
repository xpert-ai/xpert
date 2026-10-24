import { TypeOrmModule } from '@nestjs/typeorm'
import { ContentDocument } from '../../content-resource/documents/entities'
import { ContentFileOwnershipService } from './content-file-ownership.service'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { SandboxWorkspaceMapperRegistry } from '@xpert-ai/plugin-sdk'
import { createRuntimeVolumeClient, LocalShellWorkspacePathMapper, VOLUME_CLIENT, VolumeClient } from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'
import { WorkspacePathMapperFactory } from './workspace-path-mapper.factory'
import { XpertWorkAreaExtensionRegistry } from './work-area-extension.registry'

@Global()
@Module({
    imports: [DiscoveryModule, TypeOrmModule.forFeature([ContentDocument])],
    providers: [
        ContentFileOwnershipService,
        {
            provide: VOLUME_CLIENT,
            useFactory: (): VolumeClient => createRuntimeVolumeClient()
        },
        SandboxWorkspaceMapperRegistry,
        LocalShellWorkspacePathMapper,
        WorkspacePathMapperFactory,
        XpertWorkAreaExtensionRegistry,
        KnowledgeWorkAreaResolver,
        XpertWorkAreaResolver
    ],
    exports: [
        ContentFileOwnershipService,
        VOLUME_CLIENT,
        SandboxWorkspaceMapperRegistry,
        WorkspacePathMapperFactory,
        XpertWorkAreaExtensionRegistry,
        KnowledgeWorkAreaResolver,
        XpertWorkAreaResolver
    ]
})
export class VolumeModule {}
