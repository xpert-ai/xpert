import {
	IPluginConfig,
	DEFAULT_GRAPHQL_API_PATH,
	DEFAULT_API_HOST,
	DEFAULT_API_BASE_URL
} from '@metad/server-common';
import { ConnectionOptions } from 'typeorm';
import * as path from 'path';

let assetPath;
let assetPublicPath;
let serverRoot;

console.log('Plugin Config -> __dirname: ' + __dirname);
console.log('Plugin Config -> process.cwd: ' + process.cwd());

// TODO: maybe better to use process.cwd() instead of __dirname?

if (process.env.IS_DOCKER && process.env.IS_DOCKER.toLowerCase() === 'true') {
	serverRoot = '/srv/pangolin/';
	assetPath = serverRoot + 'assets';
	assetPublicPath = serverRoot + 'public';
} else if (process.env.NODE_ENV === 'production') {
	serverRoot = process.cwd()
	assetPath = path.join(serverRoot, 'assets')
	assetPublicPath = path.join(serverRoot, '..', 'public')
} else {
	serverRoot = path.resolve(__dirname, '../../../')
	assetPath = path.join(serverRoot, ...['apps', 'api', 'src', 'assets'])
	assetPublicPath = path.join(serverRoot, ...['apps', 'api', 'public'])
}

console.log('Plugin Config -> assetPath: ' + assetPath);
console.log('Plugin Config -> assetPublicPath: ' + assetPublicPath);

export const pluginConfig: IPluginConfig = {
	apiConfigOptions: {
		host: process.env.HOST || DEFAULT_API_HOST,
		port: process.env.PORT || 3333,
		baseUrl: process.env.API_BASE_URL || DEFAULT_API_BASE_URL,
		middleware: [],
		graphqlConfigOptions: {
			path: DEFAULT_GRAPHQL_API_PATH,
			playground: true,
			debug: true,
		}
	},
	dbConnectionOptions: {
		synchronize: true,
		...getDbConfig()
	},
	assetOptions: {
		assetPath: assetPath,
		assetPublicPath: assetPublicPath,
		serverRoot
	},
	// plugins: [KnowledgeBasePlugin, ChangelogPlugin]
};

function getDbConfig(): ConnectionOptions {
	const dbType =
		process.env.DB_TYPE && process.env.DB_TYPE === 'postgres'
			? 'postgres'
			: 'sqlite';

	switch (dbType) {
		case 'postgres': {
			const ssl = process.env.DB_SSL_MODE === 'true' ? true : undefined;

			return {
				type: dbType,
				host: process.env.DB_HOST || 'localhost',
				port: process.env.DB_PORT
					? parseInt(process.env.DB_PORT, 10)
					: 5432,
				database: process.env.DB_NAME || 'postgres',
				username: process.env.DB_USER || 'postgres',
				password: process.env.DB_PASS || 'root',
				logging: true,
				ssl: ssl,
				// Removes console logging, instead logs all queries in a file ormlogs.log
				logger: 'file',
				synchronize: true,
				uuidExtension: 'pgcrypto'
			};
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
		// 		logging: true,
		// 		// Removes console logging, instead logs all queries in a file ormlogs.log
		// 		logger: 'file',
		// 		synchronize: true
		// 	};
		// }
	}
}
