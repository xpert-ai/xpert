import { CrudController, TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectTeamBinding } from './project-team-binding.entity'
import { TeamBindingService } from './team-binding.service'

@ApiTags('TeamBinding')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class TeamBindingController extends CrudController<ProjectTeamBinding> {
	constructor(readonly service: TeamBindingService) {
		super(service)
	}

	@Get('project/:projectId')
	async listByProject(@Param('projectId', UUIDValidationPipe) projectId: string) {
		return this.service.listByProject(projectId)
	}
}
