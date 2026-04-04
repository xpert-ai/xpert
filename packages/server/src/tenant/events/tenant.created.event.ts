export const EVENT_TENANT_CREATED = 'tenant.created'

export class TenantCreatedEvent {
  constructor(
    public readonly tenantId: string,
    public readonly tenantName: string,
  ) {}
}
