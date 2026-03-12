import { BadRequestException, createParamDecorator, ExecutionContext } from '@nestjs/common'
import { FileStorage } from './file-storage'
import { FileStorageProviderEnum, UploadedFile } from '@metad/contracts'

export const UploadedFileStorage = createParamDecorator(
	(data: FileStorageProviderEnum, ctx: ExecutionContext): UploadedFile => {
		try {
			const request = ctx.switchToHttp().getRequest()
			const provider = new FileStorage().getProvider(data)
			return provider.mapUploadedFile(request.file)
		} catch (error) {
			console.log('Error while mapping uploaded file', error)
			throw new BadRequestException(error)
		}
	}
)
