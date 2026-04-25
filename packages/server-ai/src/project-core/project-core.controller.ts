import { CrudController, RequestContext, TransformInterceptor } from '@xpert-ai/server-core'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Get,
	Inject,
	Param,
	Post,
	Put,
	Query,
	UploadedFile,
	UseInterceptors
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { VOLUME_CLIENT, VolumeClient } from '../shared/volume/volume'
import { VolumeSubtreeClient } from '../shared/volume/volume-subtree'
import { ProjectCore } from './project-core.entity'
import { ProjectCoreService } from './project-core.service'

@ApiTags('ProjectCore')
@ApiBearerAuth()
@UseInterceptors(TransformInterceptor)
@Controller()
export class ProjectCoreController extends CrudController<ProjectCore> {
	constructor(
		readonly service: ProjectCoreService,
		@Inject(VOLUME_CLIENT)
		private readonly volumeClient: VolumeClient
	) {
		super(service)
	}

	@Get(':id/files')
	async getFiles(@Param('id') id: string, @Query('path') path?: string, @Query('deepth') deepth?: string) {
		const client = await this.createProjectFileClient(id)
		return client.list('', {
			path,
			deepth: deepth ? Number(deepth) : undefined
		})
	}

	@Get(':id/file')
	async getFile(@Param('id') id: string, @Query('path') path: string) {
		const client = await this.createProjectFileClient(id)
		return client.readFile('', path)
	}

	@Put(':id/file')
	async saveFile(@Param('id') id: string, @Body() body: { path: string; content: string }) {
		const client = await this.createProjectFileClient(id)
		return client.saveFile('', body?.path, body?.content ?? '')
	}

	@Post(':id/file/upload')
	@UseInterceptors(FileInterceptor('file'))
	async uploadFile(
		@Param('id') id: string,
		@Body('path') path: string,
		@UploadedFile() file: Express.Multer.File
	) {
		const client = await this.createProjectFileClient(id)
		return client.uploadFile('', path, file)
	}

	@Delete(':id/file')
	async deleteFile(@Param('id') id: string, @Query('path') path: string) {
		const client = await this.createProjectFileClient(id)
		return client.deleteFile('', path)
	}

	private async createProjectFileClient(id: string) {
		const project = await this.service.findOne(id)
		if (!project?.id || !project.tenantId) {
			throw new BadRequestException('Project tenant scope is required for file access')
		}

		const volume = await this.volumeClient
			.resolve({
				tenantId: project.tenantId,
				userId: project.createdById ?? RequestContext.currentUserId() ?? undefined,
				catalog: 'projects',
				projectId: project.id
			})
			.ensureRoot()

		return new VolumeSubtreeClient(volume, {
			allowRootWorkspace: true
		})
	}
}
