export enum RequestScopeLevel {
  TENANT = 'tenant',
  ORGANIZATION = 'organization'
}

export interface IRequestScopeContext {
  tenantId: string | null
  level: RequestScopeLevel
  organizationId: string | null
}
