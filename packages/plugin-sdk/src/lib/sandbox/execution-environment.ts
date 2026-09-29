/** Host-declared execution guarantees. Omitted fields mean unknown, not denied. */
export interface SandboxExecutionEnvironment {
  readonly os?: 'linux' | 'darwin' | 'windows'
  readonly homeDirectory?: string
  readonly shell?: string
  readonly shellState?: 'per-command' | 'persistent'
  readonly persistentDirectories?: readonly string[]
  readonly canInstallSystemPackages?: boolean
  readonly desktop?: boolean
}
