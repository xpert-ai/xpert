import { CrudController, TransformInterceptor } from '@xpert-ai/server-core'
import {
	Body,
	Controller,
	Delete,
	forwardRef,
	Get,
	Inject,
	Param,
	Post,
	Put,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { FileInterceptor } from '@nestjs/platform-express'
import { SkillPackageService } from '../skill-package/skill-package.service'
import { SkillRepository } from './skill-repository.entity'
import { SkillRepositoryService } from './skill-repository.service'

@ApiTags('SkillRepository')
@UseInterceptors(TransformInterceptor)
@Controller('skill-repository')
export class SkillRepositoryController extends CrudController<SkillRepository> {
	constructor(
		private readonly service: SkillRepositoryService,
		@Inject(forwardRef(() => SkillPackageService))
		private readonly skillPackageService: SkillPackageService
	) {
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

	@Post('workspace-public/ensure')
	async ensureWorkspacePublicRepository() {
		return this.skillPackageService.initializeWorkspacePublicRepository()
	}

	@Post(':id/upload')
	@UseInterceptors(FileInterceptor('file'))
	async uploadSkillPackage(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
		return this.skillPackageService.uploadWorkspacePublicRepositoryPackages(id, file)
	}
}
