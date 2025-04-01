import { ICommand } from '@nestjs/cqrs'

/**
 * Test node in workflow
 */
export class WorkflowTestNodeCommand implements ICommand {
	static readonly type = '[Xpert Agent] Test workflow node'

	constructor(
		public readonly xpertId: string,
		public readonly key: string,
		public readonly inputs: any,
		public readonly isDraft = true
	) {}
}
