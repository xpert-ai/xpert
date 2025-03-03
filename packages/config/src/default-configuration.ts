require('dotenv').config();

import {
	DEFAULT_API_HOST,
	DEFAULT_API_PORT,
	DEFAULT_API_BASE_URL,
	DEFAULT_GRAPHQL_API_PATH,
	IPluginConfig
} from '@metad/server-common';
import * as path from 'path';
import { dbConnectionConfig } from './database';

process.cwd();

let assetPath;
let assetPublicPath;
let serverRoot;

console.log('Default Config -> __dirname: ' + __dirname);
console.log('Plugin Config -> process.cwd: ' + process.cwd());

// TODO: maybe better to use process.cwd() instead of __dirname?

// for Docker
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

console.log('Default Config -> assetPath: ' + assetPath);
console.log('Default Config -> assetPublicPath: ' + assetPublicPath);

/**
 * The default configurations.
 */
export const defaultConfiguration: IPluginConfig = {
	apiConfigOptions: {
		host: process.env.HOST || DEFAULT_API_HOST,
		port: process.env.PORT || DEFAULT_API_PORT,
		baseUrl: process.env.API_BASE_URL || DEFAULT_API_BASE_URL,
		middleware: [],
		graphqlConfigOptions: {
			path: DEFAULT_GRAPHQL_API_PATH,
			playground: true,
			debug: true,
			// apolloServerPlugins: []
		}
	},
	dbConnectionOptions: {
		...dbConnectionConfig
	},
	plugins: [],
	authOptions: {
		expressSessionSecret: process.env.SESSION_SECRET || 'metad',
		userPasswordBcryptSaltRounds: 12,
		jwtSecret: process.env.JWT_SECRET || 'secretKey'
	},
	assetOptions: {
		assetPath: assetPath,
		assetPublicPath: assetPublicPath,
		serverRoot
	}
};
