import type { IFeatureCreateInput } from '@xpert-ai/contracts'
import {
  DEFAULT_ROLE_PERMISSIONS as AI_DEFAULT_ROLE_PERMISSIONS,
  AiSubscribers,
  ALL_AI_ENTITIES,
  DEFAULT_FEATURES as SERVER_AI_DEFAULT_FEATURES
} from '@xpert-ai/server-ai'
import { setConfig } from '@xpert-ai/server-config'
import {
  coreEntities,
  coreSubscribers,
  DEFAULT_FEATURES as SERVER_DEFAULT_FEATURES,
  setDefaultFeatures,
  setDefaultRolePermissions
} from '@xpert-ai/server-core'
import type { Type } from '@nestjs/common'

let prepared = false

/**
 * Composes the generic AI server runtime without importing any Data/BI domain.
 */
export function prepare(): void {
  if (prepared) {
    return
  }
  prepared = true

  const entities = coreEntities as Array<Type<unknown>>
  for (const entity of ALL_AI_ENTITIES) {
    if (!entities.includes(entity)) {
      entities.push(entity)
    }
  }
  for (const subscriber of AiSubscribers) {
    if (!coreSubscribers.includes(subscriber)) {
      coreSubscribers.push(subscriber)
    }
  }
  setConfig({
    dbConnectionOptions: {
      entities,
      subscribers: coreSubscribers
    }
  })

  const features = [...SERVER_DEFAULT_FEATURES]
  for (const feature of SERVER_AI_DEFAULT_FEATURES) {
    const existing = features.find((item) => item.code === feature.code)
    if (existing) {
      existing.children ??= []
      for (const child of feature.children ?? []) {
        if (!existing.children.some((item) => item.code === child.code)) {
          existing.children.push(child)
        }
      }
    } else {
      features.push(feature as IFeatureCreateInput)
    }
  }
  setDefaultFeatures(features)

  for (const { role, defaultEnabledPermissions } of AI_DEFAULT_ROLE_PERMISSIONS) {
    setDefaultRolePermissions(role, defaultEnabledPermissions)
  }
}
