import { forwardRef, Inject, Injectable } from '@nestjs/common'
import * as chalk from 'chalk'
import { DataSourceTypeService } from './data-source-type/data-source-type.service'
import { SemanticModelService } from './model/model.service'

@Injectable()
export class AnalyticsService {
	public count = 0

	/**
	 * Seed DB if no users exists (for simplicity and safety we only re-seed DB if no users found)
	 * TODO: this should actually include more checks, e.g. if schema migrated and many other things
	 */
	async seedDBIfEmpty() {
		// this.count = await this.dsTypeService.count()
		// console.log(chalk.magenta(`Found ${this.count} DataSource types in DB`))
		// if (this.count === 0) {
		// await this.dsTypeService.seed()
		// }
		await this.dsTypeService.syncAllTenants()
		await this.modelService.seedIfEmpty()
	}

	constructor(
		// private readonly commandBus: CommandBus,

		@Inject(forwardRef(() => DataSourceTypeService))
		private readonly dsTypeService: DataSourceTypeService,

		@Inject(forwardRef(() => SemanticModelService))
		private readonly modelService: SemanticModelService
	) {}

	getHello(): string {
		return 'Hello World!'
	}
}
