import { ICopilotRole } from '@metad/contracts'
import { Body, Controller, Logger, Param, Put, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { CrudController, TransformInterceptor } from '@metad/server-core'
import { CopilotRole } from './copilot-role.entity'
import { CopilotRoleService } from './copilot-role.service'

/**
 * @deprecated use Xpert
 */
@ApiTags('CopilotRole')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class CopilotRoleController extends CrudController<CopilotRole> {
	readonly #logger = new Logger(CopilotRoleController.name)
	constructor(
		private readonly service: CopilotRoleService,
		private readonly commandBus: CommandBus
	) {
		super(service)
	}

	@Put(':id/knowledgebases')
	async updateKnowledgebases(
		@Param('id') id: string,
		@Body('knowledgebases') knowledgebases: string[]
	): Promise<ICopilotRole> {
		return await this.service.updateKnowledgebases(id, knowledgebases)
	}
}
