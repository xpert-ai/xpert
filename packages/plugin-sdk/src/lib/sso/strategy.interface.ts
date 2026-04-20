export interface ISSOProviderDescriptor {
  provider: string
  displayName: string
  icon: string
  order: number
  startUrl: string
}

export interface ISSOProviderContext {
  tenantId: string
  organizationId?: string | null
  requestBaseUrl: string
}

export interface ISSOProviderStrategy {
  describe(
    context: ISSOProviderContext
  ):
    | ISSOProviderDescriptor
    | null
    | Promise<ISSOProviderDescriptor | null>
}
