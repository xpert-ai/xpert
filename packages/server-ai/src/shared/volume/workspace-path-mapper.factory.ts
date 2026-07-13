import { Injectable } from '@nestjs/common'
import { SandboxWorkspaceMapperRegistry, type SandboxWorkspaceMapper } from '@xpert-ai/plugin-sdk'
import {
    LOCAL_SHELL_SANDBOX_PROVIDER_TYPE,
    type VolumeHandle,
    type WorkspaceBinding,
    type WorkspaceMappingOptions
} from './volume'

/** Resolves Provider-specific workspace mappings without engine branches in Volume Core. */
@Injectable()
export class WorkspacePathMapperFactory {
    constructor(private readonly registry: SandboxWorkspaceMapperRegistry) {}

    /** Returns the mapper registered for a Runtime Provider, defaulting to the local interactive Sandbox mapper. */
    forProvider(provider?: string | null): SandboxWorkspaceMapper {
        return this.registry.get(provider ?? LOCAL_SHELL_SANDBOX_PROVIDER_TYPE)
    }

    /** Maps a server-visible Volume path into the workspace exposed by a Runtime Provider. */
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

    /** Converts a Runtime workspace path back to its server-visible Volume path. */
    mapWorkspaceToVolume(
        provider: string | null | undefined,
        binding: WorkspaceBinding,
        workspacePath: string
    ): string {
        return this.forProvider(provider).mapWorkspaceToVolume(binding, workspacePath)
    }
}
