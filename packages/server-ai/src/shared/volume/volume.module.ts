import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { SandboxWorkspaceMapperRegistry } from '@xpert-ai/plugin-sdk'
import { createRuntimeVolumeClient, LocalShellWorkspacePathMapper, VOLUME_CLIENT, VolumeClient } from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'
import { WorkspacePathMapperFactory } from './workspace-path-mapper.factory'

@Global()
@Module({
    imports: [DiscoveryModule],
    providers: [
        {
            provide: VOLUME_CLIENT,
            useFactory: (): VolumeClient => createRuntimeVolumeClient()
        },
        SandboxWorkspaceMapperRegistry,
        LocalShellWorkspacePathMapper,
        WorkspacePathMapperFactory,
        KnowledgeWorkAreaResolver,
        XpertWorkAreaResolver
    ],
    exports: [
        VOLUME_CLIENT,
        SandboxWorkspaceMapperRegistry,
        WorkspacePathMapperFactory,
        KnowledgeWorkAreaResolver,
        XpertWorkAreaResolver
    ]
})
export class VolumeModule {}
