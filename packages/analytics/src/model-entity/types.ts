export const JOB_ENTITY_SYNC = 'job-entity-sync'
export const MEMBERS_SYNC_NAME = 'dimension-members-sync'

export type TDimensionMembersSyncJob = {
    tenantId: string
    organizationId: string
    createdById: string
    modelId: string
    entityId: string
    cube: string
    dimensions: string[]
}