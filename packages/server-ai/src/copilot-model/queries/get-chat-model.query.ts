import { ICopilot, ICopilotModel, IModelAccessResolution } from '@xpert-ai/contracts'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'
import { IQuery } from '@nestjs/cqrs'

/**
 * Get a Chat Model of copilot model and check it's token limitation, record the token usage
 * 
 * @deprecated use `CreateModelClientCommand` instead
 */
export class CopilotModelGetChatModelQuery implements IQuery {
	static readonly type = '[AI Model] Get One'

	constructor(
		public readonly copilot: ICopilot,
		public readonly copilotModel: ICopilotModel,
		public readonly options: {
			abortController?: AbortController;
			// tokenCallback?: (tokens: number) => void
			usageCallback: (tokens: TLLMUsage) => void | Promise<void>
			modelAccessCallback?: (modelAccess: IModelAccessResolution) => void
			xpertId?: string
			threadId?: string
		}
	) {}
}
