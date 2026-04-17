import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectSprint } from './project-sprint.entity'
import { ProjectSprintService } from './project-sprint.service'

@ApiTags('ProjectSprint')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectSprintController extends CrudController<ProjectSprint> {
	constructor(readonly service: ProjectSprintService) {
		super(service)
	}
}
