import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, RemoveEvent, UpdateEvent } from 'typeorm'
import { Integration } from '../../integration/integration.entity'
import { Injectable } from '@nestjs/common'
import { ViewExtensionCacheService } from '../view-extension.cache.service'

@Injectable()
@EventSubscriber()
export class IntegrationViewHostCacheSubscriber implements EntitySubscriberInterface<Integration> {
  constructor(
    dataSource: DataSource,
    private readonly cacheService: ViewExtensionCacheService
  ) {
    dataSource.subscribers.push(this)
  }

  listenTo() {
    return Integration
  }

  afterInsert(event: InsertEvent<Integration>) {
    return this.invalidate(event.entity)
  }

  afterUpdate(event: UpdateEvent<Integration>) {
    return this.invalidate(event.entity ?? event.databaseEntity)
  }

  afterRemove(event: RemoveEvent<Integration>) {
    return this.invalidate(event.entity ?? event.databaseEntity)
  }

  private async invalidate(entity: unknown) {
    const id = getStringProperty(entity, 'id')
    const tenantId = getStringProperty(entity, 'tenantId')
    if (!id || !tenantId) {
      return
    }

    await this.cacheService.invalidateHostIdentity({
      tenantId,
      organizationId: getStringProperty(entity, 'organizationId'),
      hostType: 'integration',
      hostId: id
    })
  }
}

function getStringProperty(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !(key in value)) {
    return null
  }

  const candidate = Reflect.get(value, key)
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
}
