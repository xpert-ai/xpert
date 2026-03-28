import { ICommand } from '@nestjs/cqrs'
import { XpertDraftDslDTO } from '../dto'

export type XpertImportCommandOptions = {
	targetXpertId?: string
}

export class XpertImportCommand implements ICommand {
	static readonly type = '[Xpert] Import'

	constructor(
		public readonly draft: Partial<XpertDraftDslDTO>,
		public readonly options: XpertImportCommandOptions = {}
	) {}
}
