import { LanguagesEnum } from '@metad/contracts'
import { environment } from '@metad/server-config'
import { DatabaseModule, provideBullModule, provideCacheModule, provideEventEmitterModule, RedisModule, TenantModule } from '@metad/server-core'
import { DynamicModule, Module, forwardRef } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { HeaderResolver, I18nModule } from 'nestjs-i18n'
import path from 'path'
import { SeedDataService } from './seed-data.service'

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
		RedisModule
	],
	providers: [SeedDataService],
	exports: [SeedDataService]
})
export class SeederModule {
	static forPluings(): DynamicModule {
		const i18nLoaderOptions = {
			path: path.resolve(__dirname, '../../i18n/'),
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
				DatabaseModule
			],
			exports: []
		} as DynamicModule
	}
}
