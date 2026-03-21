import { TSandboxProviderMeta, TSandboxWorkForType } from '@metad/contracts'
import { SandboxBackendProtocol } from './protocol'

export type SandboxProviderCreateOptions = {
  /**
   * Working space directory for the sandbox instance
   */
  workingDirectory?: string
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
