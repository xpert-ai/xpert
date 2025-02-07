import { TCopilotModel, ILLMUsage, IXpert, IXpertAgent } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Create chatModel for xpert's copilotModel
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
			usageCallback: (tokens: ILLMUsage) => void
		}
	) {}
}
