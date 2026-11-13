import type { ExecutionSourceContext } from './execution-source.model'

/** CLI tool approvals inside the already authorized Computer environment. */
export type CliPermissionMode = 'allow' | 'restricted'

export type CliSessionStatus = 'starting' | 'running' | 'stopping' | 'exited' | 'unknown'

/** Connection choice contains no credentials. Running executions retain this snapshot. */
export type ComputerCliConnection = { mode: 'platform'; revision: number } | { mode: 'native'; revision: number }
/** Persistent preference; auto is resolved once for each new execution, never mid-run. */
export type ComputerCliConnectionPreference = { mode: 'auto' | 'platform' | 'native'; revision: number }
export type ComputerCliAuthentication = 'authenticated' | 'configured' | 'authentication_required' | 'unknown'
/** Process ownership is independent of the model payer and provider. */
export type CliExecutionSourceContext = ExecutionSourceContext

/** Guest executable/version probe result; unknown means the installation could not be confirmed. */
export type ComputerCliInstallation = 'installed' | 'missing' | 'version_mismatch' | 'unknown'

/** Authorized Computer tool inventory; installation, model support and managed execution are independent. */
export interface ComputerCliToolsView {
  /** A conversation is required to resolve the Assistant's available models. */
  state: 'ready' | 'conversation_required'
  tools: Array<{
    /** Policy-approved executable identifier and pinned version. */
    id: string
    version: string
    /** Installed at the required version and compatible with the selected model. */
    available: boolean
    /** Probe of the current container; unknown must not be treated as installed. */
    installation: ComputerCliInstallation
    /** The Assistant's selected model supports this tool's approved protocol. */
    modelCompatible: boolean
    /** A registered background runtime supports this tool, version and Computer environment. */
    managed: boolean
    preference?: ComputerCliConnectionPreference
    connection?: ComputerCliConnection
    nativeSupported?: boolean
    nativeAllowed?: boolean
    authentication?: ComputerCliAuthentication
  }>
  /** Current launch defaults; existing sessions retain their own issuance snapshot. */
  launch?: {
    assistant: string
    model: string
    /** Server-resolved path inside the mounted Computer workspace. */
    workingDirectory: string
    /** Maximum token budget for a newly issued session. */
    tokenBudget?: number
  }
}

/** Owned interactive CLI session summary; excludes execution credentials and Docker connection details. */
export interface CliSessionView {
  connection?: ComputerCliConnection
  /** Session identity, distinct from a model call or desktop control ticket. */
  id: string
  /** Immutable conversation and Assistant bindings. */
  conversationId: string
  xpertId: string
  /** Policy-approved tool/version recorded at creation. */
  tool: { id: string; version: string }
  /** Host-observed lifecycle; unknown never implies completion or permission to relaunch. */
  status: CliSessionStatus
  /** Platform model identifier captured at issuance; empty if no grant was issued. */
  defaultModelId: string
  /** Original Assistant display snapshot; historical records may fall back to its ID. */
  assistantName: string
  /** Original default model name; empty if no grant was issued. */
  model: string
  /** Server-resolved session workspace path inside Computer. */
  workingDirectory: string
  /** Explicit session budget; omitted when none is configured. */
  tokenBudget?: number
  /** Recorded actual tokens across this grant's attempts, excluding estimates. */
  usedTokens: number
  /** Tokens still reserved for attempts whose usage is not confirmed. */
  reservedTokens: number
  /** ISO absolute execution deadline, not the renewable lease expiry; creation time without a grant. */
  expiresAt: string
  /** Supervisor exit code when observed; null or absent if not known. */
  exitCode?: number | null
}
