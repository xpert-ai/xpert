import { IFileAsset, IUploadFileTarget } from '@xpert-ai/contracts'
import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UploadFileCommand } from './upload-file.command'

@ApiTags('FileUpload')
@Controller()
export class FileUploadController {
	constructor(private readonly commandBus: CommandBus) {}

	@ApiOperation({
		summary:
			'Upload a file to server-managed storage. Multi-target, Volume, and Sandbox uploads are reserved for trusted server commands.'
	})
	@ApiResponse({
		status: 200,
		description: 'The file has been successfully uploaded'
	})
	@Post('upload')
	@UseInterceptors(FileInterceptor('file'))
	async upload(
		@UploadedFile() file: Express.Multer.File,
		@Body('targets') targetsValue: string,
		@Body('metadata') metadataValue?: string
	): Promise<IFileAsset> {
		if (!file) {
			throw new BadRequestException('File is required')
		}

		const targets = this.parseJson<IUploadFileTarget[]>(targetsValue, 'targets')
		if (!Array.isArray(targets) || targets.length !== 1) {
			throw new BadRequestException('Exactly one upload target is required')
		}
		const [target] = targets
		if (
			!target ||
			typeof target !== 'object' ||
			Array.isArray(target) ||
			target.kind !== 'storage' ||
			Object.keys(target).some((key) => key !== 'kind')
		) {
			throw new BadRequestException(
				'Public file uploads support only the server-managed storage target without a client-selected locator'
			)
		}

		return this.commandBus.execute(
			new UploadFileCommand({
				source: {
					kind: 'multipart',
					file
				},
				targets: [{ kind: 'storage' }],
				metadata: metadataValue ? this.parseJson<Record<string, any>>(metadataValue, 'metadata') : undefined
			})
		)
	}

	private parseJson<T>(value: string, field: string): T {
		try {
			return JSON.parse(value) as T
		} catch {
			throw new BadRequestException(`Invalid ${field} JSON`)
		}
	}
}
