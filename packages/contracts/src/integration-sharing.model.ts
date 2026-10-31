/** Consumption never grants access to integration credentials or management. */
export type IntegrationUsage = 'configuration' | 'invoke' | 'bind'
export type IntegrationSharingPolicy = {
  visibility: 'private' | 'all-organizations' | 'selected-organizations'
  organizationIds: string[]
  usages: IntegrationUsage[]
}

/** Supplied by an authenticated request or a host-authorized, persisted runtime binding. */
export interface IntegrationUsageScope {
  tenantId: string
  organizationId: string | null
}
