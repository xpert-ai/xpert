import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import { Body, Controller, Delete, Get, Param, Post, Put, UseInterceptors } from '@nestjs/common'
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
	override async create(@Body() entity: SkillRepository) {
		return this.service.register(entity)
	}

	@Put(':id')
	override async update(@Param('id') id: string, @Body() entity: Partial<SkillRepository>) {
		return this.service.updateRepository(id, entity)
	}

	@Delete(':id')
	override async delete(@Param('id') id: string) {
		return this.service.deleteRepository(id)
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
