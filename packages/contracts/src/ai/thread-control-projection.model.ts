import type { IBasePerTenantAndOrganizationEntityModel } from '../base-entity.model'

/** Internal presentation clock; neither execution evidence nor cached permission grants. */
export interface IThreadControlProjection extends IBasePerTenantAndOrganizationEntityModel {
  id: string
  tenantId: string
  threadId: string
  revision: string
  fingerprint: string
}
