import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { Permissions } from '@xpert-ai/server-core'
import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CopilotStore } from './copilot-store.entity'
import { CopilotStoreService } from './copilot-store.service'

@ApiTags('CopilotStore')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
@Permissions(AIPermissionsEnum.XPERT_EDIT)
export class CopilotStoreController extends CrudController<CopilotStore> {
	constructor(
		private readonly service: CopilotStoreService,
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {
		super(service)
	}
}
