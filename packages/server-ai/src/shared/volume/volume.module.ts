import { Global, Injectable, Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { SandboxWorkspaceMapperRegistry, type SandboxWorkspaceMapper } from '@xpert-ai/plugin-sdk'
import {
    createRuntimeVolumeClient,
    LOCAL_SHELL_SANDBOX_PROVIDER_TYPE,
    LocalShellWorkspacePathMapper,
    VOLUME_CLIENT,
    VolumeClient,
    VolumeHandle,
    WorkspaceBinding,
    WorkspaceMappingOptions
} from './volume'
import { KnowledgeWorkAreaResolver, XpertWorkAreaResolver } from './work-area'

/** Resolves Provider-specific workspace mappings without engine branches in Volume Core. */
@Injectable()
export class WorkspacePathMapperFactory {
    constructor(private readonly registry: SandboxWorkspaceMapperRegistry) {}

    forProvider(provider?: string | null): SandboxWorkspaceMapper {
        return this.registry.get(provider ?? LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)
    }

    mapVolumeToWorkspace(
        provider: string | null | undefined,
        volume: VolumeHandle,
        options?: WorkspaceMappingOptions
    ): WorkspaceBinding {
        const serverPath = options?.serverPath === undefined ? volume.serverRoot : volume.path(options.serverPath)
        return this.forProvider(provider).mapVolumeToWorkspace(
            { serverRoot: volume.serverRoot, hostRoot: volume.hostRoot },
            { serverPath }
        )
    }

    mapWorkspaceToVolume(
        provider: string | null | undefined,
        binding: WorkspaceBinding,
        workspacePath: string
    ): string {
        return this.forProvider(provider).mapWorkspaceToVolume(binding, workspacePath)
    }
}

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
