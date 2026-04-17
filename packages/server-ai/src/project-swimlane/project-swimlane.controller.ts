import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectSwimlane } from './project-swimlane.entity'
import { ProjectSwimlaneService } from './project-swimlane.service'

@ApiTags('ProjectSwimlane')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectSwimlaneController extends CrudController<ProjectSwimlane> {
	constructor(readonly service: ProjectSwimlaneService) {
		super(service)
	}
}
