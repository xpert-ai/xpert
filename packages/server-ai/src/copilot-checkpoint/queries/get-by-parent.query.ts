import { IQuery } from '@nestjs/cqrs'

export class GetCopilotCheckpointsByParentQuery implements IQuery {
	static readonly type = '[Copilot Checkpoint] Get by parent'

	constructor(
		public readonly configurable: {
			thread_id: string
			checkpoint_ns: string
			checkpoint_id?: string
		}
	) {}
}
