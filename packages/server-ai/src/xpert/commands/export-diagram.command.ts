import { ICommand } from '@nestjs/cqrs'

export class XpertExportDiagramCommand implements ICommand {
	static readonly type = '[Xpert] Export Diagram'

	constructor(
		public readonly id: string,
		public readonly isDraft: boolean,
	) {}
}
