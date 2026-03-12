import {
	ApiKeyOrClientSecretAuthGuard,
	Public,
	UploadFileCommand,
	getFileAssetDestination,
	getStorageFileFromAsset,
	StorageFileService,
	TransformInterceptor
} from '@metad/server-core'
import { IFileAssetDestination, IStorageFile, IUploadFileTarget } from '@metad/contracts'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	Logger,
	Param,
	Post,
	UploadedFile,
	UseGuards,
	UseInterceptors
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'

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
	@UseInterceptors(FileInterceptor('file'))
	@ApiConsumes('multipart/form-data')
	@ApiBody({
		description: 'Upload a context file. The optional target field must be a JSON-encoded IUploadFileTarget.',
		schema: {
			type: 'object',
			required: ['file'],
			properties: {
				file: {
					type: 'string',
					format: 'binary'
				},
				target: {
					type: 'string',
					description:
						'Optional JSON-encoded target. Defaults to {"kind":"storage","directory":"contexts","prefix":"files"}.'
				}
			}
		}
	})
	async create(
		@UploadedFile() file: Express.Multer.File,
		@Body('target') targetValue?: string
	): Promise<IStorageFile | IFileAssetDestination> {
		const target = this.resolveUploadTarget(targetValue)
		const asset = await this.commandBus.execute(
			new UploadFileCommand({
				source: {
					kind: 'multipart',
					file
				},
				targets: [target]
			})
		)

		const destination = getFileAssetDestination(asset, target.kind)
		if (!destination || destination.status !== 'success') {
			throw new BadRequestException(
				destination?.error || `Failed to upload context file to target '${target.kind}'`
			)
		}

		if (target.kind === 'storage') {
			const storageFile = getStorageFileFromAsset(asset)
			if (!storageFile) {
				throw new BadRequestException('Failed to upload context file')
			}
			return storageFile
		}

		return destination
	}

	@Delete('file/:id')
	async delete(@Param('id') id: string) {
		return await this.storageFileService.deleteStorageFile(id)
	}

	private resolveUploadTarget(targetValue?: string): IUploadFileTarget {
		const defaultTarget: IUploadFileTarget = {
			kind: 'storage',
			directory: 'contexts',
			prefix: 'files'
		}

		if (!targetValue) {
			return defaultTarget
		}

		const target = this.parseJson<IUploadFileTarget>(targetValue, 'target')
		if (!target || Array.isArray(target) || !target.kind) {
			throw new BadRequestException('Invalid target payload')
		}

		if (target.kind === 'storage') {
			return {
				...defaultTarget,
				...target
			}
		}

		return target
	}

	private parseJson<T>(value: string, field: string): T {
		try {
			return JSON.parse(value) as T
		} catch {
			throw new BadRequestException(`Invalid ${field} JSON`)
		}
	}
}
