import { TSandboxProviderMeta, TSandboxWorkForType } from '@xpert-ai/contracts'
import { SandboxBackendProtocol } from './protocol'

export type SandboxWorkspaceBinding = {
  /**
   * Host-side bind source used by containerized sandboxes.
   */
  bindSource?: string
  /**
   * Mount target inside the sandbox container, such as `/workspace`.
   */
  containerMountPath?: string
  /**
   * Server-visible canonical volume root.
   */
  volumeRoot: string
  /**
   * Concrete sandbox-visible working path derived from the mapped workspace root.
   */
  workspacePath: string
  /**
   * Sandbox-visible workspace root that corresponds to `volumeRoot`.
   */
  workspaceRoot: string
}

export type SandboxProviderCreateOptions = {
  /**
   * Working space directory for the sandbox instance
   */
  workingDirectory?: string
  /**
   * Explicit mapping between the server-visible volume root and the sandbox-visible workspace root.
   */
  workspaceBinding?: SandboxWorkspaceBinding
  /**
   * Canonical sandbox environment identifier that owns the container lifecycle.
   */
  environmentId?: string
  /**
   * Tenant identifier
   */
  tenantId?: string
  /** Registered runtime profile. Providers resolve this to an immutable image. */
  profile?: string
  /** Immutable image reference selected by the profile registry. */
  image?: string
  /** Job sandboxes are never reused after the action completes. */
  ephemeral?: boolean
  resources?: {
    memoryMb?: number
    cpu?: number
    shmSizeMb?: number
    tempDiskMb?: number
  }
  networkPolicy?: {
    mode: 'none' | 'internal-only'
    allowedHosts?: string[]
  }
  security?: {
    runAsNonRoot: boolean
    readOnlyRootFilesystem: boolean
    noNewPrivileges: boolean
    dropCapabilities: 'all'
  }
  /** Provider-enforced absolute lifetime for the sandbox. */
  hardDeadlineMs?: number
  workFor: {
    type: TSandboxWorkForType
    id: string
  }
}

export interface ISandboxProvider<T extends SandboxBackendProtocol = SandboxBackendProtocol> {
  type: string

  meta: TSandboxProviderMeta

  /**
   * Create a new sandbox instance
   *
   * @param options
   */
  create(options?: SandboxProviderCreateOptions): Promise<T>
  /** Destroy an ephemeral sandbox by its stable work identity after process loss or cancellation. */
  destroy?(options: SandboxProviderCreateOptions & { containerRef?: string | null }): Promise<void>
  /** Provider-side image/runner readiness check used by profile health. */
  getProfileHealth?(input: {
    profile: string
    image?: string
    /** Exact trusted command used to read the runner manifest. */
    manifestCommand?: readonly string[]
    expectedManifest?: Record<string, string>
  }): Promise<{ available: boolean; reason?: string; manifest?: Record<string, string> }>
  /**
   * Get default working directory for the sandbox instances
   */
  getDefaultWorkingDir(): string
}
