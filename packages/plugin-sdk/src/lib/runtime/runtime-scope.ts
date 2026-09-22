/**
 * Trusted host context for scoped service factories. Each capability validates its required fields;
 * missing values do not grant broader access. Do not accept this scope from model input.
 */
export type RuntimeIdentityScope = {
  tenantId?: string | null
  organizationId?: string | null
  userId?: string | null
  workspaceId?: string | null
  projectId?: string | null
  xpertId?: string | null
  xpertName?: string | null
  conversationId?: string | null
  /** Platform checkpoint thread, distinct from a provider session ID. */
  threadId?: string | null
  /** Agent entry key within the calling Assistant. */
  agentKey?: string | null
  /** Current platform execution; trusted adapters may supply it lazily. */
  executionId?: string | null
}
