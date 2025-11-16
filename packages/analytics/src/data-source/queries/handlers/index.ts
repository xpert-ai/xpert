import { DataSourceStrategyHandler } from './datasource.strategy.handler'
import { OlapQueryHandler } from './olap-query.handler'
import { DataSourceQueryHandler } from './query.handler'
import { XpertDatabaseAdapterQueryHandler } from './xpert-database-adapter.handler'
import { XpertDatabasesQueryHandler } from './xpert-databases.handler'

export const QueryHandlers = [
	OlapQueryHandler,
	DataSourceQueryHandler,
	DataSourceStrategyHandler,
	XpertDatabasesQueryHandler,
	XpertDatabaseAdapterQueryHandler
]
