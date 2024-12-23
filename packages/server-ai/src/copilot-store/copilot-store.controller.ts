import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotStore } from './copilot-store.entity'
import { CopilotStoreService } from './copilot-store.service'

@ApiTags('CopilotStore')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotStoreController extends CrudController<CopilotStore> {
	constructor(
		private readonly service: CopilotStoreService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}
}
