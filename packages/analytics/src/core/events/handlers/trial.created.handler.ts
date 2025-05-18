import { CommandBus, IEventHandler } from '@nestjs/cqrs'
import { EventsHandler } from '@nestjs/cqrs/dist/decorators/events-handler.decorator'
import { InjectRepository } from '@nestjs/typeorm'
import { Employee, TrialUserCreatedEvent } from '@metad/server-core'
import { Repository } from 'typeorm'
import { DataSourceTypeService } from '../../../data-source-type/index'
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

/**
 * @deprecated use @nestjs/event-emitter like `@OnEvent('order.created')`
 */
@EventsHandler(TrialUserCreatedEvent)
export class TrialUserCreatedHandler
	implements IEventHandler<TrialUserCreatedEvent>
{
	constructor(
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
		private readonly commandBus: CommandBus
	) {}

	async handle(event: TrialUserCreatedEvent) {
		// await createLocalAgentDataSource(
		// 	employee,
		// 	this.dsRepository,
		// 	this.dstService
		// )

		// await seedTenantDefaultData(
		// 	this.dstService,
		// 	this.dsRepository,
		// 	this.businessAreaRepository,
		// 	this.businessAreaUserRepository,
		// 	this.modelRepository,
		// 	this.modelService,
		// 	this.storyRepository,
		// 	this.storyPointRepository,
		// 	this.storyWidgetRepository,
		// 	this.indicatorRepository,
		// 	employee.tenantId,
		// 	employee.userId,
		// 	employee.organizationId,
		// 	this.commandBus
		// )
	}
}
