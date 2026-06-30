import 'reflect-metadata'
import { EventEmitterModule } from '@nestjs/event-emitter'
import { AppModule } from './app.module'

jest.mock('@xpert-ai/analytics', () => ({
	AnalyticsModule: class AnalyticsModule {}
}))

jest.mock('@xpert-ai/server-config', () => ({
	ConfigModule: class ConfigModule {},
	getConfig: () => ({
		assetOptions: {
			serverRoot: ''
		}
	})
}))

jest.mock('@xpert-ai/server-core', () => {
	const { EventEmitterModule } = jest.requireActual('@nestjs/event-emitter')

	return {
		PluginModule: {
			init: () => ({ module: class PluginModule {} })
		},
		RedisModule: class RedisModule {},
		SeederModule: class SeederModule {},
		ServerAppModule: class ServerAppModule {},
		provideBullModule: () => ({ module: class BullModule {} }),
		provideCacheModule: () => ({ module: class CacheModule {} }),
		provideEventEmitterModule: () => ({ module: EventEmitterModule }),
		provideI18nModule: () => ({ module: class I18nModule {} }),
		providePinoLoggerModule: () => ({ module: class PinoLoggerModule {} }),
		provideScheduleModule: () => ({ module: class ScheduleModule {} })
	}
})

describe('AppModule', () => {
	function getImportedModuleNames() {
		const imports = Reflect.getMetadata('imports', AppModule) ?? []

		return imports.map((item: { module?: { name?: string }; name?: string }) => item?.module?.name ?? item?.name)
	}

	it('imports the event emitter bootstrap provider for tenant CLI dependencies', () => {
		const importedModuleNames = getImportedModuleNames()

		expect(importedModuleNames).toContain(EventEmitterModule.name)
	})

	it('imports the plugin module for strategy providers used by server modules', () => {
		const importedModuleNames = getImportedModuleNames()

		expect(importedModuleNames).toContain('PluginModule')
	})
})
