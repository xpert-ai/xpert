import { TEnvironmentVariable, TAcpPermissionProfile, THarnessType } from '@xpert-ai/contracts'
import { SandboxBackendProtocol } from '@xpert-ai/plugin-sdk'

export type AcpHarnessResolvedConfiguration = {
  command: string
  environment: Record<string, string>
  redactedEnvironment: Record<string, string>
}

export type AcpHarnessPreviewInput = {
  workingDirectory: string
  prompt: string
  permissionProfile: TAcpPermissionProfile
  targetPaths?: string[]
  timeoutMs: number
}

export type AcpHarnessExecutionInput = AcpHarnessPreviewInput & {
  backend: SandboxBackendProtocol
  variables: TEnvironmentVariable[]
  signal?: AbortSignal
  onOutput?: (line: string) => Promise<void> | void
}

export type AcpHarnessResult = {
  status: 'success' | 'error' | 'timeout' | 'canceled'
  exitCode: number | null
  output: string
  summary: string
  commandPreview: string
  timedOut: boolean
}

export interface IAcpHarnessAdapter {
  readonly harnessType: THarnessType

  resolveConfiguration(variables: TEnvironmentVariable[]): AcpHarnessResolvedConfiguration

  buildCommandPreview(configuration: AcpHarnessResolvedConfiguration, input: AcpHarnessPreviewInput): string

  execute(input: AcpHarnessExecutionInput): Promise<AcpHarnessResult>
}
