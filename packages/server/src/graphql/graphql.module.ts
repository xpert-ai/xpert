import { DynamicModule, Module } from '@nestjs/common';
import { GraphQLModule, GraphQLTypesLoader } from '@nestjs/graphql';
import { ConfigService } from '@xpert-ai/server-config';
import { createGraphqlModuleOptions } from './graphql-helper';

@Module({})
export class GraphqlModule {
	static registerAsync(
		options: (configService: ConfigService) => any
	): DynamicModule {
		return GraphQLModule.forRootAsync({
			useFactory: async (
				configService: ConfigService,
				typesLoader: GraphQLTypesLoader
			) => {
				return createGraphqlModuleOptions(
					configService,
					typesLoader,
					options(configService)
				);
			},
			inject: [ConfigService, GraphQLTypesLoader],
			imports: []
		}) as DynamicModule;
	}
}
