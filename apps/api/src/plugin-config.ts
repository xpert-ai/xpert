import { getConfig } from '@xpert-ai/server-config'
import {
  IPluginConfig,
  DEFAULT_GRAPHQL_API_PATH,
  DEFAULT_API_HOST,
  DEFAULT_API_BASE_URL
} from '@xpert-ai/server-common'
import { ConnectionOptions } from 'typeorm'

export const pluginConfig: IPluginConfig = {
  apiConfigOptions: {
    host: process.env.HOST || DEFAULT_API_HOST,
    port: process.env.PORT || 3000,
    baseUrl: process.env.API_BASE_URL || DEFAULT_API_BASE_URL,
    middleware: [],
    graphqlConfigOptions: {
      path: DEFAULT_GRAPHQL_API_PATH,
      playground: true,
      debug: true
    }
  },
  dbConnectionOptions: {
    synchronize: false,
    ...getDbConfig()
  },
  assetOptions: getConfig().assetOptions
  // plugins: [KnowledgeBasePlugin, ChangelogPlugin]
}

function getDbConfig(): ConnectionOptions {
  const dbType = process.env.DB_TYPE && process.env.DB_TYPE === 'postgres' ? 'postgres' : 'sqlite'

  switch (dbType) {
    case 'postgres': {
      const ssl = process.env.DB_SSL_MODE === 'true' ? true : undefined

      return {
        type: dbType,
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
        database: process.env.DB_NAME || 'postgres',
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || 'root',
        logging: false,
        ssl: ssl,
        // Removes console logging, instead logs all queries in a file ormlogs.log
        logger: 'file',
        // All environments use schema-sync, which protects SQL-managed tables.
        synchronize: false,
        uuidExtension: 'pgcrypto'
      }
    }

    // case 'sqlite': {
    // 	const sqlitePath =
    // 		process.env.DB_PATH ||
    // 		path.join(
    // 			path.resolve('.', ...['apps', 'api', 'data']),
    // 			'xxxx.sqlite3'
    // 		);

    // 	return {
    // 		type: dbType,
    // 		database: sqlitePath,
    // 		logging: false,
    // 		// Removes console logging, instead logs all queries in a file ormlogs.log
    // 		logger: 'file',
    // 		synchronize: true
    // 	};
    // }
  }
}
