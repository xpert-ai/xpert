import { ICopilot, ICopilotModel } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Get a rerank instance of copilot model and check it's token limitation, record the token usage
 */
export class CopilotModelGetRerankQuery implements IQuery {
	static readonly type = '[AI Model] Get rerank'

	constructor(
		public readonly copilot: ICopilot,
		public readonly copilotModel: ICopilotModel,
		public readonly options: {
			abortController?: AbortController;
			tokenCallback?: (tokens: number) => void
		}
	) {}
}
