import { BadRequestException, Injectable } from '@nestjs/common'
import { SandboxManagedServiceErrorCode } from '@xpert-ai/contracts'
import { t } from 'i18next'
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
        const type = provider ?? LOCAL_SHELL_SANDBOX_PROVIDER_TYPE
        const mapper = this.registry.listRegistrations().find((item) => item.type === type)?.strategy
        if (!mapper) {
            throw new BadRequestException({
                code: SandboxManagedServiceErrorCode.ProviderUnavailable,
                message: t('server-ai:Error.SandboxWorkspaceMapperUnavailable', {
                    defaultValue: 'Workspace mapping is unavailable for sandbox provider: {{provider}}',
                    provider: type
                })
            })
        }
        return mapper
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
