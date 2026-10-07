import type {
  ModelExecutionModel,
  ModelExecutionLimits,
  ModelExecutionProtocol,
  ModelFeature,
  CliPermissionMode
} from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'

/** Configuration adapters describe secrets by reference; only the host materializes credentials. */
export const CLI_MODEL_TOKEN_REFERENCE = '${XPERT_EXECUTION_TOKEN}'
export interface CliModelConfiguration {
  args: string[]
  environment: Record<string, string>
  files: Array<{ name: string; content: string }>
}
export interface CliModelConfigurationInput {
  directory: string
  gatewayBaseUrl: string
  models: Array<Pick<ModelExecutionModel, 'id' | 'protocols'>>
  limits: Pick<ModelExecutionLimits, 'maxInputTokens' | 'maxOutputTokens'>
  managed: boolean
  /** Host-resolved background approval policy; omitted preserves interactive/shell behavior. */
  permissionMode?: CliPermissionMode
}
/** Installed trusted code; neither an executable path nor a model permission comes from this adapter. */
export interface CliModelProfile {
  id: string
  revision: string
  command: string
  protocol: Extract<ModelExecutionProtocol, 'openai_chat' | 'openai_responses' | 'anthropic_messages'>
  requiredCapabilities: ModelFeature[]
  /** Modes this profile explicitly implements; unsupported modes must not be silently ignored. */
  permissionModes?: readonly CliPermissionMode[]
  chatBridge?: { versions: readonly string[]; requiredCapabilities: ModelFeature[] }
  /** Optional host-managed background transport. Arguments are trusted profile code, never model input. */
  background?: {
    versions: readonly string[]
  } & ({ transport: 'opencode' } | { transport: 'jsonl'; args: readonly string[] })
  /** Exact complete argv sequences that never need a model grant. */
  offlineArguments: readonly (readonly string[])[]
  /** Exact accepted stdout values for a policy-pinned version probe. */
  versionOutputs(version: string): string[]
  configure(input: CliModelConfigurationInput): CliModelConfiguration
}
export interface CliModelProfiles {
  get(id: string): CliModelProfile | undefined
}
export const CliModelProfilesCapability = createRuntimeCapability<CliModelProfiles>('platform.cli_model_profiles')

/** Additional execution sources can validate lifecycle without making OS depend on Pro entities. */
export const ShellModelExecutionSourceCapability = createRuntimeCapability<{
  assertCurrent(context: import('@xpert-ai/contracts').ModelExecutionContext, preparing?: boolean): Promise<void>
}>('platform.model_execution.shell_source')
