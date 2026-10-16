/** Updates follow a Git branch; existing runtime selections remain pinned. */
export interface AgentPluginUpdateProgress {
  operationId: string | null
  packageId: string | null
  branch: string | null
  commit: string | null
  phase: 'idle' | 'updating' | 'completed' | 'failed'
  result?: { packageId: string; status: 'imported' | 'existing' | 'repaired' }
  error?: string
}
export interface AgentPluginCleanupItem {
  packageId: string
  version: string
  reason: 'current' | 'updating' | 'configured' | 'referenced' | 'unreferenced'
}
export interface AgentPluginCleanupResult {
  targetPackageId: string
  items: AgentPluginCleanupItem[]
  deleted: string[]
  pendingFileCleanup: number
}
