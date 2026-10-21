import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalyticsProviderRegistry, AnalyticsProviderRegistryV2, StrategyBus } from '@xpert-ai/plugin-sdk'
import { AnalyticsModule } from './analytics.module'
import { AnalyticsRuntimeV2Service } from './analytics-runtime-v2.service'
import { AnalyticsInventoryService } from './analytics-inventory.service'
import { DataSourceModule } from '../data-source/data-source.module'
import { DataSourceTypeModule } from '../data-source-type'
import { DataSource } from '../data-source/data-source.entity'
import { AnalyticsRuntimeService } from '../data-source/analytics/analytics-runtime.service'

@Global()
@Module({ providers: [StrategyBus], exports: [StrategyBus] })
class PluginGlobals {}
@Module({
	providers: [
		{ provide: getRepositoryToken(DataSource), useValue: {} },
		{ provide: AnalyticsRuntimeService, useValue: {} }
	],
	exports: [getRepositoryToken(DataSource), AnalyticsRuntimeService]
})
class Sources {}
@Module({ providers: [{ provide: AnalyticsProviderRegistry, useValue: {} }], exports: [AnalyticsProviderRegistry] })
class Types {}

it('initializes the production AnalyticsModule through explicit host exports', async () => {
	const module = await Test.createTestingModule({ imports: [PluginGlobals, AnalyticsModule] })
		.overrideModule(DataSourceModule)
		.useModule(Sources)
		.overrideModule(DataSourceTypeModule)
		.useModule(Types)
		.compile()
	try {
		await module.init()
		expect(module.get(AnalyticsRuntimeV2Service)).toBeInstanceOf(AnalyticsRuntimeV2Service)
		expect(module.get(AnalyticsInventoryService)).toBeInstanceOf(AnalyticsInventoryService)
		expect(module.get(AnalyticsProviderRegistryV2)).toBeInstanceOf(AnalyticsProviderRegistryV2)
	} finally {
		await module.close()
	}
})
