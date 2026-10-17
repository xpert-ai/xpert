import { applyDecorators, Injectable, SetMetadata } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { STRATEGY_META_KEY } from '../../types'
import type { AnalyticsQueryProvider } from './analytics-provider'

export const ANALYTICS_PROVIDER = 'ANALYTICS_QUERY_PROVIDER'
/** Mark a Nest provider registered by a plugin module; id must match its descriptor.id. */
export const AnalyticsProvider = (id: string) =>
  applyDecorators(SetMetadata(ANALYTICS_PROVIDER, id), SetMetadata(STRATEGY_META_KEY, ANALYTICS_PROVIDER))
/** Uses shared plugin scoping; execution callers list providers for the current actor's organization. */
@Injectable()
export class AnalyticsProviderRegistry extends BaseStrategyRegistry<AnalyticsQueryProvider> {
  constructor(discovery: DiscoveryService, reflector: Reflector) {
    super(ANALYTICS_PROVIDER, discovery, reflector)
  }
}
