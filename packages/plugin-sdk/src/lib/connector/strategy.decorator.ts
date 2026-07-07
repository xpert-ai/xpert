import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const CONNECTOR_STRATEGY = 'CONNECTOR_STRATEGY'

export const ConnectorStrategyKey = (provider: string) =>
  applyDecorators(SetMetadata(CONNECTOR_STRATEGY, provider), SetMetadata(STRATEGY_META_KEY, CONNECTOR_STRATEGY))
