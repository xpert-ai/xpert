import { isNotEmpty } from '@metad/server-common';
import { GqlModuleOptions, GraphQLTypesLoader } from '@nestjs/graphql';
import { buildSchema, extendSchema, printSchema } from 'graphql';
import path from 'path';
import { ConfigService } from '@metad/server-config';

export async function createGraphqlModuleOptions(
	configService: ConfigService,
	typesLoader: GraphQLTypesLoader,
	options: any
): Promise<GqlModuleOptions> {
	return {
		path: `/${options.path}`,
		// typeDefs: await createTypeDefs(configService, options, typesLoader),
		playground: options.playground || false,
		debug: options.debug || false,
		cors: {
			methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
			credentials: true,
			origin: '*',
			allowedHeaders:
				'Authorization, Language, Tenant-Id, X-Requested-With, X-Auth-Token, X-HTTP-Method-Override, Content-Type, Content-Language, Accept, Accept-Language, Observe'
		},
		include: [options.resolverModule]
	} as GqlModuleOptions;
}

async function createTypeDefs(
	configService: ConfigService,
	options: any,
	typesLoader: GraphQLTypesLoader
): Promise<string> {
	const normalizedPaths = options.typePaths.map((p) =>
		p.split(path.sep).join('/')
	);
	const typeDefs = await typesLoader.mergeTypesByPaths(normalizedPaths);
	const schema = buildSchema(typeDefs);

	// getPluginExtensions(configService.plugins)
	// 	.map((e) => (typeof e.schema === 'function' ? e.schema() : e.schema))
	// 	.filter(isNotEmpty)
	// 	.forEach(
	// 		(documentNode) => (schema = extendSchema(schema, documentNode))
	// 	);

	return printSchema(schema);
}
