import { FileStorageProviderEnum, IScreenshot, IStorageFile, UploadedFile } from '@metad/contracts'
import {
	Body,
	Controller,
	Delete,
	ExecutionContext,
	HttpStatus,
	Param,
	Post,
	UseInterceptors,
	UsePipes,
	ValidationPipe
} from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger'
import * as path from 'path'
import { StorageFileService } from './storage-file.service'
import { FileStorage, UploadedFileStorage } from '../core/file-storage'
import { StorageFile } from './storage-file.entity'
import { UUIDValidationPipe } from '../shared'
import { LazyFileInterceptor } from '../core/interceptors'

@ApiTags('StorageFile')
@Controller()
export class StorageFileController {
	constructor(private readonly storageFileService: StorageFileService) {}

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
	@UseInterceptors(
		LazyFileInterceptor('file', {
			storage: (request: ExecutionContext) => {
                return new FileStorage().storage({
					dest: path.join('files'),
					prefix: 'files'
				})
            }
        })
	  )
	async create(@Body() entity: StorageFile, @UploadedFileStorage() file: UploadedFile) {
		const { key, url, originalname, size, mimetype, encoding } = file;
		const decodedOriginalName = Buffer.from(originalname, 'latin1').toString('utf8');
		const provider = new FileStorage().getProvider();
		return await this.storageFileService.create({
			file: key,
			url: url,
			originalName: decodedOriginalName,
			encoding,
			size,
			mimetype,
			storageProvider: (provider.name).toUpperCase() as FileStorageProviderEnum,
			recordedAt: new Date(),
		})
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
