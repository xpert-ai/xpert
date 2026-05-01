import { ICommand } from '@nestjs/cqrs'

export class XpertExportTemplateCommand implements ICommand {
	static readonly type = '[Xpert] Export DSL Template'

	constructor(
		public readonly id: string,
		public readonly isDraft: boolean,
		public readonly includeMemory?: boolean
	) {}
}
