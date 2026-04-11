import { BusinessType } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class BookmarkGetCommand implements ICommand {
	static readonly type = '[Bookmark] Get'

	constructor(public readonly input: {
		type: BusinessType,
		entity?: string,
		project?: string
	}) {}
}
