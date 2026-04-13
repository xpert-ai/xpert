import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotModel } from './copilot-model.entity'
import { CopilotModelService } from './copilot-model.service'

@ApiTags('CopilotModel')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotModelController extends CrudController<CopilotModel> {
	constructor(
		private readonly service: CopilotModelService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}
}
