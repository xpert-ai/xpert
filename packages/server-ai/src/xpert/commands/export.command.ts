import { ICommand } from '@nestjs/cqrs'

export class XpertExportCommand implements ICommand {
	static readonly type = '[Xpert] Export DSL'

	constructor(
		public readonly id: string,
		public readonly isDraft: boolean,
	) {}
}
