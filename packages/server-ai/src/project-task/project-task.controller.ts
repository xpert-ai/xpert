import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectTask } from './project-task.entity'
import { ProjectTaskService } from './project-task.service'

@ApiTags('ProjectTask')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectTaskController extends CrudController<ProjectTask> {
	constructor(readonly service: ProjectTaskService) {
		super(service)
	}
}
