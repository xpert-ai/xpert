import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { AnalyticsProviderRegistryV2 } from '@xpert-ai/plugin-sdk'
import { DataSourceModule } from '../data-source/data-source.module'
import { AnalyticsRuntimeV2Service, ANALYTICS_SOURCE_RESOLVERS } from './analytics-runtime-v2.service'
import { AnalyticsV2Controller } from './analytics.controller'
import { DataSourceTypeModule } from '../data-source-type'
import { AnalyticsInventoryService } from './analytics-inventory.service'
import { AnalyticsInventoryController } from './analytics-inventory.controller'

@Module({
	imports: [DiscoveryModule, DataSourceModule, DataSourceTypeModule],
	controllers: [AnalyticsV2Controller, AnalyticsInventoryController],
	providers: [
		AnalyticsInventoryService,
		AnalyticsRuntimeV2Service,
		AnalyticsProviderRegistryV2,
		// Definition persistence and Artifact ACL adapters are introduced by the next rollout group.
		{ provide: ANALYTICS_SOURCE_RESOLVERS, useValue: [] }
	],
	exports: [AnalyticsRuntimeV2Service]
})
export class AnalyticsModule {}
