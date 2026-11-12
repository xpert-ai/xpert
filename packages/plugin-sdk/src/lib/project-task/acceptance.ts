/** Current formal acceptance facts; consumers decide which review mode their workflow requires. */
export interface ProjectTaskAcceptanceReceipt {
  projectId: string
  taskId: string
  taskRevision: number
  conversationId: string
  decisionId: string
  review: {
    executionId: string
    mode: 'evidence_only' | 'execution'
    verdict: 'pass' | 'changes_required' | 'indeterminate'
  } | null
  artifacts: Array<{ artifactId: string; versionId: string }>
}
