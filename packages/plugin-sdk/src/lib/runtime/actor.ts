/** Trusted execution identity supplied by the host or a persisted job, never by client payloads. */
export interface RuntimeActor {
  tenantId: string
  userId: string
  organizationId?: string | null
}
/** Organization-bound operations require an explicit organization, including background executions. */
export interface OrganizationRuntimeActor extends RuntimeActor {
  organizationId: string
}
