import { TypeOrmModule } from '@nestjs/typeorm'
import { ContentResourceEntry } from '../../content-resource/catalog/content-entry.entity'
import { ContentDocument } from '../../content-resource/documents/entities'
import { ContentFileOwnershipService } from './content-file-ownership.service'
import { Global, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { CommandBus, CqrsModule } from '@nestjs/cqrs'
import { commandVolumeWriteBudget } from './volume-write-budget'
import { SandboxWorkspaceMapperRegistry } from '@xpert-ai/plugin-sdk'
import { createRuntimeVolumeClient, LocalShellWorkspacePathMapper, VOLUME_CLIENT, VolumeClient } from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'
import { WorkspacePathMapperFactory } from './workspace-path-mapper.factory'
import { XpertWorkAreaExtensionRegistry } from './work-area-extension.registry'

@Global()
@Module({
    imports: [DiscoveryModule, CqrsModule, TypeOrmModule.forFeature([ContentDocument, ContentResourceEntry])],
    providers: [
        ContentFileOwnershipService,
        {
            provide: VOLUME_CLIENT,
            inject: [CommandBus],
            useFactory: (commands: CommandBus): VolumeClient =>
                createRuntimeVolumeClient(commandVolumeWriteBudget(commands))
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
