import { UploadedFile } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class SpeechToTextCommand implements ICommand {
	static readonly type = '[Chat] Speech to Text'

	constructor(
		public readonly file: UploadedFile,
		public readonly options: {
			isDraft?: boolean
			xpertId?: string
		}
	) {}
}
