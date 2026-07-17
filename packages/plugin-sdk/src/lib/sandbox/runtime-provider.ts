/** Per-execution limits applied to the Runtime Definition's fixed Runner command. */
export type SandboxRuntimeExecutionOptions = {
  timeoutMs?: number
  maxOutputBytes?: number
}

/** Provider-observed reason why a Runtime execution stopped without a normal exit. */
export type SandboxRuntimeTerminationReason = 'oom' | 'deadline' | 'cancelled' | 'runtime-died'

/** Normalized process result returned by every Sandbox Runtime implementation. */
export type SandboxRuntimeExecuteResponse = {
  output: string
  exitCode: number | null
  truncated: boolean
  timedOut?: boolean
  terminationReason?: SandboxRuntimeTerminationReason
}

/** Portable failure categories for Runtime workspace file operations. */
export type SandboxRuntimeFileOperationError = 'file_not_found' | 'permission_denied' | 'is_directory' | 'invalid_path'

export type SandboxRuntimeFileUploadResponse = {
  path: string
  error: SandboxRuntimeFileOperationError | null
}

export type SandboxRuntimeFileDownloadResponse = {
  path: string
  content: Uint8Array | null
  error: SandboxRuntimeFileOperationError | null
}

/**
 * Core-resolved Workspace file source that a system Runtime Provider may expose
 * read-only to one Job. These paths are never part of plugin payloads or Action
 * manifests and must not be persisted as business data.
 */
export type SandboxRuntimeReadOnlyFileSource = {
  /** Canonical path visible to the API process. */
  serverPath: string
  /** Equivalent source path visible to the Provider engine, for example Docker. */
  hostPath: string
  size: number
  mtimeMs: number
  device: number
  inode: number
}

/** Exact Job-workspace alias for one authorized, seekable Workspace file. */
export type SandboxRuntimeReadOnlyFile = {
  source: SandboxRuntimeReadOnlyFileSource
  /** Safe relative path below the Runtime workspace root. */
  targetPath: string
  /** Immutable identity asserted by the system plugin that owns the Action. */
  size: number
  sha256: string
}

/** Resource policy requested by a provider-neutral Runtime Definition. */
export type SandboxRuntimeResources = {
  memoryMb: number
  cpu: number
  shmSizeMb: number
  tempDiskMb: number
}

/** Network access that a Provider must enforce for the Runtime instance. */
export type SandboxRuntimeNetworkPolicy = {
  mode: 'none' | 'internal-only'
  allowedHosts?: string[]
}

/** Mandatory process and filesystem hardening for a Runtime instance. */
export type SandboxRuntimeSecurity = {
  runAsNonRoot: boolean
  readOnlyRootFilesystem: boolean
  noNewPrivileges: boolean
  dropCapabilities: 'all'
}

/** Isolation guarantees a Provider advertises before it can be selected. */
export type SandboxRuntimeProviderCapabilities = {
  isolation: 'process' | 'hardened'
  ephemeral: boolean
  resourceLimits: boolean
  networkPolicy: boolean
  readOnlyRootFilesystem: boolean
  /** Supports Job-scoped, read-only, seekable Workspace file mappings. */
  readOnlyFileMounts?: boolean
}

/** Minimum Provider guarantees required by a Runtime Definition. */
export type SandboxRuntimeRequirements = SandboxRuntimeProviderCapabilities

/**
 * Provider-neutral execution profile published by the Sandbox Runtime Suite.
 *
 * Definitions select no image, engine, plugin, or host path. The platform owns
 * the fixed Runner command and matches it to a compatible Provider Binding.
 */
export type SandboxRuntimeDefinition = {
  /** Stable profile identity referenced by Action manifests. */
  name: string
  /** Trusted Runner Host argv. Plugin callers cannot override this value. */
  command: readonly string[]
  /** Runner Host protocol version shared with compatible Action Bundles. */
  contractVersion: string
  /** Version of the Runtime Suite contents, independent of Provider version. */
  sandboxRuntimeVersion: string
  timeoutMs: number
  hardDeadlineMs: number
  resources: SandboxRuntimeResources
  networkPolicy: SandboxRuntimeNetworkPolicy
  security: SandboxRuntimeSecurity
  requirements: SandboxRuntimeRequirements
  expectedManifest: Record<string, string>
}

/** Immutable or provider-addressable runtime artifact selected by a Binding. */
export type SandboxRuntimeArtifact = {
  kind: 'oci-image' | 'filesystem' | 'remote-runtime'
  /** Provider-native immutable address; OCI production references must include a digest. */
  reference: string
  /** Normalized digest retained separately as runtime evidence when available. */
  digest?: string
}

/** Provider-owned mapping from one Runtime Definition to an executable artifact. */
export type SandboxRuntimeBinding = {
  /** Stable Provider-owned Binding identity persisted on every attempt. */
  id: string
  runtimeProfile: string
  /** Must match the registered Provider strategy type. */
  provider: string
  /** Lower values are preferred. Ties are resolved by provider and binding id. */
  priority: number
  providerVersion: string
  artifact: SandboxRuntimeArtifact
  /**
   * Allows a Binding with reduced isolation guarantees to participate only in
   * development/test. Core always rejects this Binding in production.
   */
  developmentOnly?: true
}

/** Result of verifying an engine, artifact, security guarantees, and Runtime manifest. */
export type SandboxRuntimeBindingHealth = {
  available: boolean
  reason?: string
  manifest?: Record<string, string>
}

/** Job-isolated storage roots passed to a Provider without exposing them to plugins. */
export type SandboxRuntimeVolume = {
  /** Path visible to the Xpert process. */
  serverRoot: string
  /** Path suitable for a provider-side bind mount. */
  hostRoot: string
}

/** Fully resolved policy used to create or reattach one ephemeral Job Runtime. */
export type SandboxRuntimeCreateOptions = {
  tenantId: string
  workFor: {
    type: 'job'
    id: string
  }
  definition: SandboxRuntimeDefinition
  binding: SandboxRuntimeBinding
  volume: SandboxRuntimeVolume
  ephemeral: true
  resources: SandboxRuntimeResources
  networkPolicy: SandboxRuntimeNetworkPolicy
  security: SandboxRuntimeSecurity
  hardDeadlineMs: number
  /**
   * Core-authorized read-only inputs resolved from portable Workspace
   * references. Providers must expose each source only at its targetPath and
   * must not make any broader Workspace subtree visible to the Runtime.
   */
  readOnlyFiles?: readonly SandboxRuntimeReadOnlyFile[]
}

/** Persisted evidence required to destroy a Runtime even after Provider reload. */
export type SandboxRuntimeDestroyOptions = {
  tenantId: string
  workFor: {
    type: 'job'
    id: string
  }
  runtimeProfile: string
  runtimeBindingId: string
  artifact: SandboxRuntimeArtifact
  runtimeRef?: string | null
}

/**
 * Minimal execution surface required by Sandbox Jobs.
 *
 * Implementations must constrain `execute()` to the Definition's trusted Runner
 * argv and must confine all file operations to `workspaceRoot`.
 */
export interface SandboxRuntimeInstance {
  readonly id: string
  /** Absolute path visible inside the isolated Runtime, normally `/workspace`. */
  readonly workspaceRoot: string
  /** Executes Core-supplied argv after the Provider verifies the trusted Runner prefix. */
  execute(argv: readonly string[], options?: SandboxRuntimeExecutionOptions): Promise<SandboxRuntimeExecuteResponse>
  /** Writes files only inside the instance workspace and returns per-path failures. */
  uploadFiles(files: Array<[string, Uint8Array]>): Promise<SandboxRuntimeFileUploadResponse[]>
  /** Reads files only inside the instance workspace and returns per-path failures. */
  downloadFiles(paths: string[]): Promise<SandboxRuntimeFileDownloadResponse[]>
  /** Best-effort immediate termination used by cancellation and deadline handling. */
  terminate?(): Promise<void> | void
}

/**
 * Small Provider SPI for background Sandbox Jobs.
 *
 * This interface is intentionally independent from the interactive Agent Sandbox
 * backend protocol. Providers are registered only by built-ins or system plugins,
 * are selected from declared Bindings, and must make `destroy()` idempotent.
 */
export interface ISandboxRuntimeProvider {
  readonly type: string
  readonly version: string
  readonly capabilities: SandboxRuntimeProviderCapabilities
  /** Lists immutable artifacts this Provider can bind to Runtime Definitions. */
  listBindings(): Promise<readonly SandboxRuntimeBinding[]> | readonly SandboxRuntimeBinding[]
  /** Probes the engine and artifact without creating a business Job instance. */
  getBindingHealth(input: {
    definition: SandboxRuntimeDefinition
    binding: SandboxRuntimeBinding
  }): Promise<SandboxRuntimeBindingHealth>
  /** Creates or reattaches the unique Runtime instance for the supplied Job scope. */
  create(options: SandboxRuntimeCreateOptions): Promise<SandboxRuntimeInstance>
  /** Idempotently reclaims a Runtime by persisted scope, Binding, and runtimeRef evidence. */
  destroy(options: SandboxRuntimeDestroyOptions): Promise<void>
}
