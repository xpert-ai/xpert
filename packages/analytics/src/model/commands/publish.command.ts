import { ICommand } from '@nestjs/cqrs'

/**
 * Release and if create a new version
 */
export class SemanticModelPublishCommand implements ICommand {
	static readonly type = '[Semantic Model] Publish'

	constructor(
		public readonly id: string,
		public readonly notes: string,
	) { }
}
