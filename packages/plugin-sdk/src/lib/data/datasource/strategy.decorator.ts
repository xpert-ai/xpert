import { SetMetadata } from '@nestjs/common'

export const DATASOURCE_STRATEGY = 'DATASOURCE_STRATEGY'

export const DataSourceStrategy = (provider: string) => SetMetadata(DATASOURCE_STRATEGY, provider)
