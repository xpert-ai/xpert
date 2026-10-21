import { Global, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AnalyticsProviderRegistry, DataSourceStrategyRegistry, StrategyBus } from '@xpert-ai/plugin-sdk'
import { AnalyticsModule } from './analytics.module'
import { AnalyticsRuntimeService, ANALYTICS_SOURCE_RESOLVERS } from './analytics-runtime.service'
import { DataSourceModule } from '../data-source/data-source.module'
import { DataSourceTypeModule } from '../data-source-type'
import { DataSource } from '../data-source/data-source.entity'
@Global()
@Module({ providers: [StrategyBus], exports: [StrategyBus] })
class PluginGlobals {}
@Module({
	providers: [{ provide: getRepositoryToken(DataSource), useValue: {} }],
	exports: [getRepositoryToken(DataSource)]
})
class Sources {}
@Module({ providers: [{ provide: DataSourceStrategyRegistry, useValue: {} }], exports: [DataSourceStrategyRegistry] })
class Types {}
it('wires exactly one registry/runtime and all three host resolvers through explicit module exports', async () => {
	const module = await Test.createTestingModule({ imports: [PluginGlobals, AnalyticsModule] })
		.overrideModule(DataSourceModule)
		.useModule(Sources)
		.overrideModule(DataSourceTypeModule)
		.useModule(Types)
		.compile()
	try {
		await module.init()
		expect(module.get(AnalyticsRuntimeService)).toBeInstanceOf(AnalyticsRuntimeService)
		expect(module.get(AnalyticsProviderRegistry)).toBeInstanceOf(AnalyticsProviderRegistry)
		expect(module.get(ANALYTICS_SOURCE_RESOLVERS).map((resolver) => resolver.kind)).toEqual([
			'data-source',
			'definition',
			'artifact'
		])
	} finally {
		await module.close()
	}
})
