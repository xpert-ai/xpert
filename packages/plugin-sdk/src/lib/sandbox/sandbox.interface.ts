import { SandboxBackendProtocol } from "./protocol"

export type SandboxProviderCreateOptions = {
  workingDirectory?: string
}

export interface ISandboxProvider<T extends SandboxBackendProtocol = SandboxBackendProtocol> {
  type: string
  
  meta: {
    name: string
  }

  create(options?: SandboxProviderCreateOptions): Promise<T>
  getDefaultWorkingDir(): string
}
