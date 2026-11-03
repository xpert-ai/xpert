export const CONNECTION_REFERENCE_KINDS = [
  'defaults',
  'assistants',
  'knowledgebases',
  'projects',
  'connections',
  'gateways',
  'membershipPlans',
  'accessGrants',
  'accessRequests',
  'executions',
  'voiceSessions'
] as const

export type ConnectionReferenceKind = (typeof CONNECTION_REFERENCE_KINDS)[number]

/** Current business dependencies that prevent permanent connection removal. */
export interface ConnectionDeletionImpact {
  enabled: boolean
  canDelete: boolean
  references: Record<ConnectionReferenceKind, number>
}
