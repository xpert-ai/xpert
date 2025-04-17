import { Controller, Get, Param, Put, UseGuards } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Environment } from './environment.entity'
import { EnvironmentService } from './environment.service'
import { CrudController } from '@metad/server-core'
import { WorkspaceGuard } from '../xpert-workspace'
import { EnvironmentPublicDTO } from './dto'

@ApiTags('Environment')
@Controller()
export class EnvironmentController extends CrudController<Environment> {
	constructor(readonly service: EnvironmentService) {
		super(service)
	}

	@UseGuards(WorkspaceGuard)
	@Get('default/:workspaceId')
	async getDefaultByWorkspace(@Param('workspaceId') workspaceId: string) {
		const env = await this.service.getDefaultByWorkspace(workspaceId)
		return new EnvironmentPublicDTO(env)
	}

	@Put(':id/as-default')
	async setAsDefault(@Param('id') id: string) {
		return this.service.setAsDefault(id)
	}
}
