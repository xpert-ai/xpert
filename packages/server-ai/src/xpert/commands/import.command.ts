import { XpertDraftDslDTO } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class XpertImportCommand implements ICommand {
	static readonly type = '[Xpert] Import'

	constructor(public readonly draft: XpertDraftDslDTO) {}
}
