import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'
import type { ResourceCardType } from './types'

export const RESOURCE_CARD_PROVIDER = 'RESOURCE_CARD_PROVIDER'

/** Register exact resource types whose message cards opt in to live refresh. */
export const ResourceCardProvider = (...resources: ResourceCardType[]) => {
  if (!resources.length || resources.some(({ namespace, type }) => !namespace?.trim() || !type?.trim())) {
    throw new Error('ResourceCardProvider requires explicit resource namespaces and types')
  }
  return applyDecorators(
    SetMetadata(RESOURCE_CARD_PROVIDER, resources),
    SetMetadata(STRATEGY_META_KEY, RESOURCE_CARD_PROVIDER)
  )
}
