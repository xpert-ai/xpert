import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { TenantCreatedEvent, TenantService } from '@metad/server-core'
import { Repository } from 'typeorm'
import { DataSourceTypeService } from '../../../data-source-type/index'
import { SemanticModelService } from '../../../model/index'
import {
	BusinessArea,
	BusinessAreaUser,
	DataSource,
	Indicator,
	SemanticModel,
	Story,
	StoryPoint,
	StoryWidget,
} from '../../entities/internal'
import { seedTenantDefaultData } from './seeds'

/**
 * @deprecated
 */
@EventsHandler(TenantCreatedEvent)
export class TenantCreatedHandler implements IEventHandler<TenantCreatedEvent> {
	constructor(
		private readonly tenantService: TenantService,
		@InjectRepository(DataSource)
		private readonly dsRepository: Repository<DataSource>,
		@InjectRepository(SemanticModel)
		private readonly modelRepository: Repository<SemanticModel>,
		@InjectRepository(Story)
		private readonly storyRepository: Repository<Story>,
		@InjectRepository(StoryPoint)
		private readonly storyPointRepository: Repository<StoryPoint>,
		@InjectRepository(StoryWidget)
		private readonly storyWidgetRepository: Repository<StoryWidget>,
		@InjectRepository(BusinessArea)
		private readonly businessAreaRepository: Repository<BusinessArea>,
		@InjectRepository(BusinessAreaUser)
		private readonly businessAreaUserRepository: Repository<BusinessAreaUser>,
		@InjectRepository(Indicator)
		private readonly indicatorRepository: Repository<Indicator>,
		private readonly dstService: DataSourceTypeService,
		private readonly modelService: SemanticModelService,
		private readonly commandBus: CommandBus
	) {}

	async handle(event: TenantCreatedEvent) {

		const tenant = await this.tenantService.findOne(event.tenantId)

		await seedTenantDefaultData(
			this.dstService,
			this.dsRepository,
			this.businessAreaRepository,
			this.businessAreaUserRepository,
			this.modelRepository,
			this.modelService,
			this.storyRepository,
			this.storyPointRepository,
			this.storyWidgetRepository,
			this.indicatorRepository,
			tenant.id,
			null,
			null,
			this.commandBus
		)
	}
}
