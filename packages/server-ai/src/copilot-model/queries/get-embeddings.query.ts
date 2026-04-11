import { ICopilot, ICopilotModel } from '@xpert-ai/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Get a Embeddings instance of copilot model and check it's token limitation, record the token usage
 */
export class CopilotModelGetEmbeddingsQuery implements IQuery {
	static readonly type = '[AI Model] Get Embeddings'

	constructor(
		public readonly copilot: ICopilot,
		public readonly copilotModel: ICopilotModel,
		public readonly options: {
			abortController?: AbortController;
			tokenCallback?: (tokens: number) => void
		}
	) {}
}
