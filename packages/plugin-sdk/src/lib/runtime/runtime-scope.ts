/** Host-authorized identity and execution binding; never accept this from tool arguments or HTTP bodies. */
export type RuntimeIdentityScope = {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  xpertName?: string | null
  conversationId?: string | null
  threadId?: string | null
  agentKey?: string | null
  executionId?: string | null
}
