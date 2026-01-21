import { TSandboxProviderMeta } from "@metad/contracts"
import { SandboxBackendProtocol } from "./protocol"

export type SandboxProviderCreateOptions = {
  /**
   * Working space directory for the sandbox instance
   */
  workingDirectory?: string
  /**
   * Sandbox container environment identifier
   */
  environmentId?: string
  /**
   * Tenant identifier
   */
  tenantId?: string
  /**
   * User identifier
   */
  userId?: string
  /**
   * Project identifier
   */
  projectId?: string
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
