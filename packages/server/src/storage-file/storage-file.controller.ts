import { IScreenshot, IStorageFile } from '@metad/contracts'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	HttpStatus,
	Param,
	Post,
	UploadedFile,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import { FileInterceptor } from '@nestjs/platform-express'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import axios from 'axios'
import path from 'path'
import { StorageFileService } from './storage-file.service'
import { FileStorage } from '../file/file-storage/file-storage'
import { StorageFile } from './storage-file.entity'
import { UUIDValidationPipe } from '../shared/pipes'
import { UploadFileCommand } from '../file/file-upload/upload-file.command'
import { getStorageFileFromAsset } from '../file/file-upload/types'

@ApiTags('StorageFile')
@Controller()
export class StorageFileController {
	constructor(
		private readonly storageFileService: StorageFileService,
		private readonly commandBus: CommandBus
	) {}

	@ApiOperation({ summary: 'Add storage file' })
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The storage file has been successfully upload.'
	})
	@ApiResponse({
		status: HttpStatus.BAD_REQUEST,
		description: 'Invalid input, The response body may contain clues as to what went wrong'
	})
	@Post()
	@UseInterceptors(FileInterceptor('file'))
	async create(@Body() entity: StorageFile, @UploadedFile() file: Express.Multer.File) {
		const asset = await this.commandBus.execute(
			new UploadFileCommand({
				source: {
					kind: 'multipart',
					file
				},
				targets: [
					{
						kind: 'storage',
						directory: path.join('files'),
						prefix: 'files'
					}
				]
			})
		)
		const storageFile = getStorageFileFromAsset(asset)
		if (!storageFile) {
			throw new BadRequestException('Failed to upload storage file')
		}
		return storageFile
	}

	@Post('url')
	async createUrl(@Body() entity: StorageFile) {
		const { url } = entity

		try {
			// Download the file from the URL
			const response = await axios.get(url, { responseType: 'arraybuffer' })

			// 将 ArrayBuffer 转换为 Node.js 的 Buffer 类型
			const buffer = Buffer.from(response.data)

			// Save the file using FileStorage
			const provider = new FileStorage().getProvider()
			const file = await provider.putFile(url)

			const { key, url: _url, originalname, size, mimetype, encoding } = file

			const decodedOriginalName = Buffer.from(originalname, 'latin1').toString('utf8')
			return await this.storageFileService.create({
				file: key,
				url: _url,
				originalName: decodedOriginalName,
				encoding,
				size,
				mimetype,
				storageProvider: `${provider.name}`.toUpperCase(),
				recordedAt: new Date()
			})
		} catch (error) {
			throw new BadRequestException(`Failed to download and store file from URL: ${error.message}`)
		}
	}

	@ApiOperation({
		summary: 'Delete record'
	})
	@ApiResponse({
		status: HttpStatus.OK,
		description: 'The record has been successfully deleted'
	})
	@ApiResponse({
		status: HttpStatus.NOT_FOUND,
		description: 'Record not found'
	})
	@Delete(':id')
	@UsePipes(new ValidationPipe())
	async delete(@Param('id', UUIDValidationPipe) id: IScreenshot['id']): Promise<IStorageFile> {
		return await this.storageFileService.deleteStorageFile(id)
	}
}
