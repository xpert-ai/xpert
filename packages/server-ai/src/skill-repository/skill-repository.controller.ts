import { CrudController, TransformInterceptor } from '@metad/server-core'
import { Body, Controller, Get, Post, UseInterceptors } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { SkillRepository } from './skill-repository.entity'
import { SkillRepositoryService } from './skill-repository.service'

@ApiTags('SkillRepository')
@UseInterceptors(TransformInterceptor)
@Controller('skill-repository')
export class SkillRepositoryController extends CrudController<SkillRepository> {
	constructor(private readonly service: SkillRepositoryService) {
		super(service)
	}

	@Post()
	async save(@Body() entity: SkillRepository) {
		return this.service.register(entity)
	}

	@Get('source-strategies')
	async getSourceStrategies() {
		return this.service.getSourceStrategies()
	}

	@Get('availables')
	async findAvailables() {
		return this.service.findAllInOrganizationOrTenant({
			order: {
				updatedAt: 'DESC'
			}
		})
	}
}
