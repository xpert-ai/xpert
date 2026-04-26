import { createSprintId } from '@xpert-ai/contracts'
import { TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Controller, Param, Post, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectOrchestratorService } from './project-orchestrator.service'

@ApiTags('ProjectOrchestrator')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectOrchestratorController {
	constructor(private readonly service: ProjectOrchestratorService) {}

	@Post('sprint/:sprintId/dispatch')
	async dispatchRunnableTasks(@Param('sprintId', UUIDValidationPipe) sprintId: string) {
		return this.service.dispatchRunnableTasks(createSprintId(sprintId))
	}
}
