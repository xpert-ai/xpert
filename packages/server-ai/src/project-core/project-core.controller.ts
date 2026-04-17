import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Controller, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectCore } from './project-core.entity'
import { ProjectCoreService } from './project-core.service'

@ApiTags('ProjectCore')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectCoreController extends CrudController<ProjectCore> {
	constructor(readonly service: ProjectCoreService) {
		super(service)
	}
}
