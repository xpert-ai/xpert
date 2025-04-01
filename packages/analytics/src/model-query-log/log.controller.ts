import { CrudController } from '@metad/server-core'
import { Controller } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ModelQueryLogService } from './log.service'
import { SemanticModelQueryLog } from './log.entity'

@ApiTags('SemanticModelQueryLog')
@ApiBearerAuth()
@Controller()
export class ModelQueryLogController extends CrudController<SemanticModelQueryLog> {
	constructor(
		private readonly service: ModelQueryLogService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}
}
