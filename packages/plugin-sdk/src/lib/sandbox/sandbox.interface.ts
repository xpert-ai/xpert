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
  /**
   * Get default working directory for the sandbox instances
   */
  getDefaultWorkingDir(): string
}
