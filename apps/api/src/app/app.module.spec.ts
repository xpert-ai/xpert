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
	it('imports the event emitter bootstrap provider for tenant CLI dependencies', () => {
		const imports = Reflect.getMetadata('imports', AppModule) ?? []
		const importedModuleNames = imports.map((item: any) => item?.module?.name ?? item?.name)

		expect(importedModuleNames).toContain(EventEmitterModule.name)
	})
})
