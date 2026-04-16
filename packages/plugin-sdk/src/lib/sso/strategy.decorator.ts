import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const SSO_PROVIDER = 'SSO_PROVIDER'

export const SSOProviderStrategyKey = (provider: string) =>
  applyDecorators(SetMetadata(SSO_PROVIDER, provider), SetMetadata(STRATEGY_META_KEY, SSO_PROVIDER))
