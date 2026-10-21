import { DatabaseAnalyticsSourceResolver } from './analytics-database.resolver'
import { CqrsModule } from '@nestjs/cqrs'
import { DefinitionAnalyticsSourceResolver, ArtifactAnalyticsSourceResolver } from './analytics-source.resolvers'
import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { AnalyticsProviderRegistry } from '@xpert-ai/plugin-sdk'
import { DataSourceModule } from '../data-source/data-source.module'
import { AnalyticsRuntimeService, ANALYTICS_SOURCE_RESOLVERS } from './analytics-runtime.service'
import { AnalyticsController } from './analytics.controller'
import { DataSourceTypeModule } from '../data-source-type'

@Module({
	imports: [CqrsModule, DiscoveryModule, DataSourceModule, DataSourceTypeModule],
	controllers: [AnalyticsController],
	providers: [
		AnalyticsRuntimeService,
		AnalyticsProviderRegistry,
		DatabaseAnalyticsSourceResolver,
		DefinitionAnalyticsSourceResolver,
		ArtifactAnalyticsSourceResolver,
		{
			provide: ANALYTICS_SOURCE_RESOLVERS,
			inject: [
				DatabaseAnalyticsSourceResolver,
				DefinitionAnalyticsSourceResolver,
				ArtifactAnalyticsSourceResolver
			],
			useFactory: (
				database: DatabaseAnalyticsSourceResolver,
				definitions: DefinitionAnalyticsSourceResolver,
				artifacts: ArtifactAnalyticsSourceResolver
			) => [database, definitions, artifacts]
		}
	],
	exports: [AnalyticsRuntimeService, AnalyticsProviderRegistry]
})
export class AnalyticsModule {}
