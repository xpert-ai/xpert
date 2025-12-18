import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types'

export const DATASOURCE_STRATEGY = 'DATASOURCE_STRATEGY'

export const DataSourceStrategy = (provider: string) => applyDecorators(
    SetMetadata(DATASOURCE_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, DATASOURCE_STRATEGY),
)
