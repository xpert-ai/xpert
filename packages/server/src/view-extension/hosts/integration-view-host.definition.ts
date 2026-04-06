import { PermissionsEnum, XpertViewSlot } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { RequestContext } from '../../core/context'
import { IntegrationService } from '../../integration/integration.service'
import { ViewHostDefinition } from '../host-definition.decorator'
import { XpertViewHostDefinition } from '../host-definition.interface'

@Injectable()
@ViewHostDefinition('integration')
export class IntegrationViewHostDefinition implements XpertViewHostDefinition {
  readonly hostType = 'integration'
  readonly slots: XpertViewSlot[] = [{ key: 'detail.main_tabs', mode: 'tabs', order: 0 }]

  constructor(private readonly integrationService: IntegrationService) {}

  async resolve(hostId: string) {
    const integration = await this.integrationService.findOneByIdWithinTenant(hostId, RequestContext.currentTenantId())

    return {
      hostSnapshot: {
        id: integration.id,
        name: integration.name,
        provider: integration.provider,
        type: integration.provider,
        enabled: true,
        botToken: getStringProperty(integration.options, 'botToken'),
        status: getIntegrationStatus(integration.options),
        workspace: getStringProperty(integration.options, 'teamName') ?? getStringProperty(integration.options, 'workspace'),
        team: getStringProperty(integration.options, 'teamName') ?? getStringProperty(integration.options, 'team'),
        botUser: getStringProperty(integration.options, 'botUserName') ?? getStringProperty(integration.options, 'botUserId'),
        users: getUsers(integration.options),
        lastSyncAt: getStringProperty(integration.options, 'lastSyncAt'),
        updatedAt: integration.updatedAt?.toISOString?.() ?? null
      }
    }
  }

  canRead() {
    return RequestContext.hasAnyPermission([PermissionsEnum.INTEGRATION_VIEW, PermissionsEnum.INTEGRATION_EDIT], false)
  }
}

function getIntegrationStatus(value: unknown) {
  return (
    getStringProperty(value, 'status') ??
    getStringProperty(value, 'connectionStatus') ??
    getStringProperty(value, 'state') ??
    'unknown'
  )
}

function getUsers(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('users' in value)) {
    return []
  }

  const users = Reflect.get(value, 'users')
  return Array.isArray(users) ? users : []
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}
