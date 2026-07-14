import type { SandboxWorkspaceBinding } from './sandbox.interface'

/** Server-visible and Provider-visible roots for the same isolated volume. */
export type SandboxWorkspaceVolume = {
  serverRoot: string
  hostRoot: string
}

/** Optional server path to translate within a mapped volume. */
export type SandboxWorkspaceMappingOptions = {
  serverPath?: string
}

/**
 * Translates paths between platform volumes and Provider-visible workspaces.
 * Engine-specific path logic belongs here instead of in OSS Volume services.
 */
export interface SandboxWorkspaceMapper {
  /** Produces a Provider-visible binding for one path inside the isolated platform volume. */
  mapVolumeToWorkspace(
    volume: SandboxWorkspaceVolume,
    options?: SandboxWorkspaceMappingOptions
  ): SandboxWorkspaceBinding
  /** Converts a Provider-visible path back to its server path, rejecting escapes. */
  mapWorkspaceToVolume(binding: SandboxWorkspaceBinding, workspacePath: string): string
}
