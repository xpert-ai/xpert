import type { CliPermissionMode, ModelExecutionEnvironment } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../../core/runtime-capability'
import type { AgentInvocationScope, AgentInvocationResult, AgentJson } from './types'
import type { AgentArtifactSelection } from './results'

/** A host-managed process location. Remote service runtimes can use their own session/run handles. */
export type AgentRunnerEnvironment = Extract<ModelExecutionEnvironment, { type: 'computer' | 'sandbox' }>

/** A durable process receipt, not a second Agent task or a credential. Host methods must revalidate ownership. */
interface AgentRunnerReceiptBase {
  /** Owning platform invocation; never a caller-selected process launch key. */
  invocationId: string
  /** Bound environment instance; replacing the instance invalidates this receipt. */
  environment: AgentRunnerEnvironment
  /** Opaque host process reference, not necessarily an operating-system PID. */
  processId: string
  /** Model execution grant ID only; never store its bearer secret in the receipt. */
  grantId: string
  /** Actual business cwd selected by the host; retained verbatim for historical receipts. */
  workingDirectory: string
  /** Tool selected from the approved binding and host policy, independent of the model provider. */
  tool: { id: string; version: string }
  /** Effective policy pinned when this process started; absent on historical receipts. */
  permissionMode?: CliPermissionMode
}

/** V1 retains its original cwd; V2 separates per-invocation records from the business cwd. */
export type AgentRunnerReceipt = AgentRunnerReceiptBase & ({ version: 1 } | { version: 2; executionDirectory: string })

/** Per-scope host capability. Methods recheck the persisted invocation and receipt before side effects. */
export interface AgentExecutionRunner {
  /** Resolve the already persisted Invocation/Binding. Checkpoint before sending launch input. */
  start(invocationId: string, checkpoint: (receipt: AgentRunnerReceipt) => Promise<void>): Promise<AgentRunnerReceipt>
  /** Observe the existing process. Unknown is not permission to relaunch or proof of completion. */
  inspect(receipt: AgentRunnerReceipt): Promise<{ state: 'running' | 'exited' | 'unknown'; exitCode?: number }>
  /** Relative HTTP request over the approved local service transport; no caller-supplied URL or headers. */
  request(
    receipt: AgentRunnerReceipt,
    request: { method: 'GET' | 'POST'; path: string; body?: AgentJson; query?: { limit: number } }
  ): Promise<unknown>
  /** Export only selected files after revalidating the persisted delivery request. No selection means no export. */
  collectArtifacts(
    receipt: AgentRunnerReceipt,
    selection?: AgentArtifactSelection
  ): Promise<NonNullable<AgentInvocationResult['artifacts']>>
  /** Revoke model access and request process termination. Only exited confirms termination. */
  stop(receipt: AgentRunnerReceipt): Promise<{ state: 'exited' | 'stopping' | 'unknown' }>
}

export const AgentExecutionRunnerCapability = createRuntimeCapability<AgentExecutionRunner>(
  'platform.agent_execution.runner'
)
export interface AgentExecutionRunnerFactory {
  /** Capture trusted scope only; defer authorization and I/O to runner methods. Never launch during construction. */
  createScopedRunner(scope: Readonly<AgentInvocationScope>): AgentExecutionRunner
}
export const AgentExecutionRunnerFactoryCapability = createRuntimeCapability<AgentExecutionRunnerFactory>(
  'platform.agent_execution.runner.factory'
)
