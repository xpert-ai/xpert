import { TCopilotModel, IXpert, IXpertAgent } from '@xpert-ai/contracts'
import type { TLLMUsage } from '@xpert-ai/plugin-sdk'
import { IQuery } from '@nestjs/cqrs'

/**
 * Create chatModel for xpert's copilotModel, The order of priority is:
 * 1. copilotModel in options
 * 2. agent.copilotModel, but agent param is deprecated
 * 3. xpert.copilotModel
 */
export class GetXpertChatModelQuery implements IQuery {
	static readonly type = '[Xpert] Get chatModel for agent'

	constructor(
		public readonly xpert: IXpert,
		/**
		 * @deprecated use copilotModel in options
		 */
		public readonly agent: IXpertAgent,
		public readonly options: {
			copilotModel?: TCopilotModel
			abortController?: AbortController;
			// tokenCallback?: (tokens: number) => void
			usageCallback: (tokens: TLLMUsage) => void | Promise<void>
			threadId: string
		}
	) {}
}
