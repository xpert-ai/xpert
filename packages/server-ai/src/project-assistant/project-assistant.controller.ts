import { TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Body, Controller, Param, Post, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { ProjectAssistantActionDto, ProjectAssistantActionAcceptedDto } from './dto/project-assistant-action.dto'
import { ProjectAssistantActionService } from './services/project-assistant-action.service'

@ApiTags('ProjectAssistant')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectAssistantController {
	constructor(private readonly actionService: ProjectAssistantActionService) {}

	@Post(':projectId/actions')
	async runAction(
		@Param('projectId', UUIDValidationPipe) projectId: string,
		@Body() body: ProjectAssistantActionDto
	) {
		const result = await this.actionService.execute(projectId, body)
		return new ProjectAssistantActionAcceptedDto(result)
	}
}
