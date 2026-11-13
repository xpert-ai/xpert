/** Execution ownership and location are independent of model access and billing. */
export type ExecutionEnvironment =
  | { type: 'computer' | 'sandbox'; environmentId: string; instanceId: string }
  | { type: 'remote'; bindingId: string; revision: string }
export type ExecutionSource =
  | { type: 'cli_session'; cliSessionId: string }
  | { type: 'agent_invocation'; invocationId: string; bindingId: string; bindingRevision: string }
  /** One CLI child, not the containing shell; IDs and revision are resolved by the trusted host. */
  | {
      type: 'shell_execution'
      executionId: string
      shellExecutionId: string
      parentExecutionId: string
      generation: number
      profileRevision: string
    }

export interface ExecutionSourceContext {
  tenantId: string
  runtimeOrganizationId: string
  actorUserId: string
  xpertId: string
  /** Display snapshot; historical grants may only have the immutable ID. */
  assistantName?: string
  assistantVersion: string
  conversationId: string
  threadId?: string
  source: ExecutionSource
  environment: ExecutionEnvironment
  tool: { id: string; version: string }
}
