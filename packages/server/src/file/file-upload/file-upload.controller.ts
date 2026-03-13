import { IFileAsset, IUploadFileTarget } from '@metad/contracts'
import { BadRequestException, Body, Controller, Post, UploadedFile, UseInterceptors } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import { UploadFileCommand } from './upload-file.command'

@ApiTags('FileUpload')
@Controller()
export class FileUploadController {
	constructor(private readonly commandBus: CommandBus) {}

	@ApiOperation({ summary: 'Upload a file to one or more destinations' })
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
		if (!Array.isArray(targets) || !targets.length) {
			throw new BadRequestException('At least one upload target is required')
		}

		return this.commandBus.execute(
			new UploadFileCommand({
				source: {
					kind: 'multipart',
					file
				},
				targets,
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
