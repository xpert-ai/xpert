import { ICommand } from '@nestjs/cqrs'
import { XpertDraftDslDTO } from '../dto'

export class XpertImportCommand implements ICommand {
	static readonly type = '[Xpert] Import'

	constructor(public readonly draft: XpertDraftDslDTO) {}
}
