import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../types'

export const EVOLUTION_TARGET_PROVIDER = 'EVOLUTION_TARGET_PROVIDER'

export const EvolutionTargetProviderStrategy = (providerKey: string) =>
  applyDecorators(
    SetMetadata(EVOLUTION_TARGET_PROVIDER, providerKey),
    SetMetadata(STRATEGY_META_KEY, EVOLUTION_TARGET_PROVIDER)
  )
