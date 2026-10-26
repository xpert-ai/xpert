/** Host-selected Codex execution boundary. This describes policy, not command readiness. */
export type ComputerCodexIsolationPolicy = {
  provider: 'codex'
  approvalPolicy: 'never'
  commandReadiness: 'verify_before_launch'
} & (
  | { sandboxMode: 'workspace-write'; enforcement: 'codex' }
  | { sandboxMode: 'danger-full-access'; enforcement: 'computer' }
)
