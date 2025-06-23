import { ICommand } from '@nestjs/cqrs'

/**
 * Export expert, including published or draft versions
 * @returns XpertDraftDslDTO
 */
export class XpertExportCommand implements ICommand {
	static readonly type = '[Xpert] Export DSL'

	constructor(
		public readonly id: string,
		public readonly isDraft: boolean,
	) {}
}
