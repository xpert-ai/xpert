import { ListTablesHandler } from './list-tables.handler'
import { DataLoadHandler } from './load.handler'
import { DataSourcePingHandler } from './ping.handler'
import { QuerySchemaHandler } from './query-schema.handler'
import { QuerySqlHandler } from './query-sql.handler'

export const CommandHandlers = [
	DataLoadHandler,
	ListTablesHandler,
	QuerySchemaHandler,
	QuerySqlHandler,
	DataSourcePingHandler
]
