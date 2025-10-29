import { DataSourceStrategyHandler } from './datasource.strategy.handler'
import { OlapQueryHandler } from './olap-query.handler'
import { DataSourceQueryHandler } from './query.handler'

export const QueryHandlers = [OlapQueryHandler, DataSourceQueryHandler, DataSourceStrategyHandler]
