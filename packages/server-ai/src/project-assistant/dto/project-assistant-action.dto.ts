import {
	IProjectAssistantActionAccepted,
	IProjectAssistantActionRequest,
	IProjectAssistantActionResponse,
	ProjectAssistantActionTypeEnum,
	ProjectSprintStrategyEnum
} from '@xpert-ai/contracts'
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEnum, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

export class ProjectAssistantBootstrapSprintDto {
	@ApiProperty({ enum: ProjectSprintStrategyEnum })
	@IsEnum(ProjectSprintStrategyEnum)
	strategyType: ProjectSprintStrategyEnum

	@ApiProperty({ type: () => String })
	@IsString()
	goal: string
}

export class ProjectAssistantActionDto implements IProjectAssistantActionRequest {
	@ApiProperty({ enum: ProjectAssistantActionTypeEnum })
	@IsEnum(ProjectAssistantActionTypeEnum)
	actionType: ProjectAssistantActionTypeEnum

	@ApiPropertyOptional({ type: () => String, format: 'uuid' })
	@IsOptional()
	@IsUUID()
	sprintId?: string

	@ApiPropertyOptional({ type: () => String })
	@IsOptional()
	@IsString()
	instruction?: string

	@ApiPropertyOptional({ type: () => ProjectAssistantBootstrapSprintDto })
	@IsOptional()
	@ValidateNested()
	@Type(() => ProjectAssistantBootstrapSprintDto)
	bootstrapSprint?: ProjectAssistantBootstrapSprintDto
}

export class ProjectAssistantActionAcceptedDto implements IProjectAssistantActionAccepted {
	@ApiProperty({ type: () => Boolean, default: true })
	accepted: true

	@ApiProperty({ type: () => String })
	conversationId: string

	@ApiProperty({ type: () => String })
	dispatchId: string

	constructor(partial: IProjectAssistantActionAccepted) {
		Object.assign(this, partial)
	}
}

export function isProjectAssistantActionAccepted(
	value: IProjectAssistantActionResponse
): value is IProjectAssistantActionAccepted {
	return 'accepted' in value && value.accepted === true
}
