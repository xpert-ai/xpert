import { XpertTypeEnum } from '@xpert-ai/contracts'
import { ViewExtensionCacheService } from '@xpert-ai/server-core'
import { Injectable } from '@nestjs/common'
import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, RemoveEvent, UpdateEvent } from 'typeorm'
import { Environment } from '../environment/environment.entity'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { Xpert } from '../xpert/xpert.entity'

type SupportedHostEntity = Knowledgebase | Xpert | XpertProject | Environment

@Injectable()
@EventSubscriber()
export class ViewHostCacheSubscriber implements EntitySubscriberInterface<SupportedHostEntity> {
  constructor(
    dataSource: DataSource,
    private readonly cacheService: ViewExtensionCacheService
  ) {
    dataSource.subscribers.push(this)
  }

  afterInsert(event: InsertEvent<SupportedHostEntity>) {
    return this.invalidate(event.metadata.target, event.entity)
  }

  afterUpdate(event: UpdateEvent<SupportedHostEntity>) {
    return this.invalidate(event.metadata.target, event.entity ?? event.databaseEntity)
  }

  afterRemove(event: RemoveEvent<SupportedHostEntity>) {
    return this.invalidate(event.metadata.target, event.entity ?? event.databaseEntity)
  }

  private async invalidate(target: Function | string, entity: unknown) {
    if (!entity || typeof entity !== 'object' || Array.isArray(entity)) {
      return
    }

    const identity = resolveHostIdentity(target, entity)
    if (!identity) {
      return
    }

    await this.cacheService.invalidateHostIdentity(identity)
  }
}

function resolveHostIdentity(target: Function | string, entity: object) {
  const id = getString(entity, 'id')
  const tenantId = getString(entity, 'tenantId')

  if (!id || !tenantId) {
    return null
  }

  const organizationId = getString(entity, 'organizationId')
  const hostType = resolveHostType(target, entity)
  if (!hostType) {
    return null
  }

  return {
    tenantId,
    organizationId,
    hostType,
    hostId: id
  }
}

function resolveHostType(target: Function | string, entity: object) {
  if (target === Knowledgebase || target === 'Knowledgebase') {
    return 'knowledgebase'
  }

  if (target === XpertProject || target === 'XpertProject') {
    return 'project'
  }

  if (target === Environment || target === 'Environment') {
    return 'sandbox'
  }

  if (target === Xpert || target === 'Xpert') {
    return getString(entity, 'type') === XpertTypeEnum.Agent ? 'agent' : null
  }

  return null
}

function getString(entity: object, key: string) {
  if (!(key in entity)) {
    return null
  }

  const value = Reflect.get(entity, key)
  return typeof value === 'string' && value.length > 0 ? value : null
}
