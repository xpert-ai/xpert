import { ICommand } from '@nestjs/cqrs'
import { TUploadFileInput } from './types'

export class UploadFileCommand implements ICommand {
	static readonly type = '[FileUpload] Upload file'

	constructor(public readonly input: TUploadFileInput) {}
}
