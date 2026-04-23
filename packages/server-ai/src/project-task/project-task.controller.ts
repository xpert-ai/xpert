import { IProjectTaskMoveInput, IProjectTaskReorderInput } from '@xpert-ai/contracts'
import { CrudController, TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Body, Controller, Param, Post, UseInterceptors } from '@nestjs/common'
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

	@Post('move')
	async moveTasks(@Body() body: IProjectTaskMoveInput) {
		return this.service.moveTasks(body.taskIds ?? [], body.targetSwimlaneId)
	}

	@Post('swimlane/:swimlaneId/reorder')
	async reorderInLane(
		@Param('swimlaneId', UUIDValidationPipe) swimlaneId: string,
		@Body() body: IProjectTaskReorderInput
	) {
		return this.service.reorderInLane(swimlaneId, body.orderedTaskIds ?? [])
	}
}
