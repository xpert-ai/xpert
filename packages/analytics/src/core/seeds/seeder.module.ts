import { LanguagesEnum } from '@xpert-ai/contracts'
import { environment } from '@xpert-ai/server-config'
import { DatabaseModule, provideBullModule, provideCacheModule, provideEventEmitterModule, RedisModule, TenantModule } from '@xpert-ai/server-core'
import { DynamicModule, Module, forwardRef } from '@nestjs/common'
import { CqrsModule } from '@nestjs/cqrs'
import { ConfigModule } from '@nestjs/config'
import { HeaderResolver, I18nModule } from 'nestjs-i18n'
import { existsSync } from 'fs'
import path from 'path'
import { SeedDataService } from './seed-data.service'

function resolveI18nPath() {
	const candidates = [
		path.resolve(__dirname, '../../i18n/'),
		path.resolve(process.cwd(), 'packages/analytics/src/i18n/'),
		path.resolve(process.cwd(), 'dist/packages/analytics/src/i18n/')
	]

	return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
}

/**
 * Import and provide seeder classes.
 *
 * @module
 */
@Module({
	imports: [
		forwardRef(() => TenantModule),
		ConfigModule.forRoot({
			isGlobal: true
		}),
		CqrsModule,
		RedisModule
	],
	providers: [SeedDataService],
	exports: [SeedDataService]
})
export class SeederModule {
	static forPluings(): DynamicModule {
		const i18nLoaderOptions = {
			path: resolveI18nPath(),
			watch: !environment.production
		}
		return {
			module: SeederModule,
			providers: [],
			imports: [
				I18nModule.forRoot({
					fallbackLanguage: LanguagesEnum.English,
					loaderOptions: i18nLoaderOptions,
					resolvers: [new HeaderResolver(['language'])]
				}),
				provideCacheModule(),
				provideBullModule(),
				provideEventEmitterModule(),
				CqrsModule,
				DatabaseModule
			],
			exports: []
		} as DynamicModule
	}
}
