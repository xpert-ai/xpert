// SeedDataService uses repositories directly. Importing the HTTP TenantModule
// incorrectly requires API-only event, cache and i18n providers in the CLI.
import { DynamicModule, Module } from '@nestjs/common'
import { SeedDataService } from './seed-data.service'
import { DatabaseModule } from '../../database'

@Module({
	providers: [SeedDataService],
	exports: [SeedDataService]
})
export class SeederModule {
	static forPluings(): DynamicModule {
		return {
			module: SeederModule,
			imports: [DatabaseModule]
		}
	}
}
