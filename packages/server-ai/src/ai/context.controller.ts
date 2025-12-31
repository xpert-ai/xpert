import { UploadedFile } from '@metad/contracts'
import {
	ApiKeyOrClientSecretAuthGuard,
	FileStorage,
	LazyFileInterceptor,
	Public,
	StorageFileService,
	TransformInterceptor,
	UploadedFileStorage
} from '@metad/server-core'
import { Controller, ExecutionContext, Logger, Post, UseGuards, UseInterceptors } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import path from 'path'

/**
 * Context APIs for AI (files, documents, etc.)
 */
@ApiTags('AI/Contexts')
@ApiBearerAuth()
@Public()
@UseGuards(ApiKeyOrClientSecretAuthGuard)
@UseInterceptors(TransformInterceptor)
@Controller('contexts')
export class ContextsController {
	readonly #logger = new Logger(ContextsController.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly commandBus: CommandBus,
		private readonly storageFileService: StorageFileService
	) {}

	@Post('file')
	@UseInterceptors(
		LazyFileInterceptor('file', {
			storage: (request: ExecutionContext) => {
				return new FileStorage().storage({
					dest: path.join('contexts'),
					prefix: 'files'
				})
			}
		})
	)
	async create(@UploadedFileStorage() file: UploadedFile) {
		return await this.storageFileService.createStorageFile(file)
	}
}
