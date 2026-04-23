import { TransformInterceptor, UUIDValidationPipe } from '@xpert-ai/server-core'
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { TeamDefinitionService } from './team-definition.service'

@ApiTags('TeamDefinition')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class TeamDefinitionController {
	constructor(private readonly service: TeamDefinitionService) {}

	@Get()
	async findAll() {
		return this.service.findAll()
	}

	@Get(':id')
	async findOne(@Param('id', UUIDValidationPipe) id: string) {
		return this.service.findOne(id)
	}
}
