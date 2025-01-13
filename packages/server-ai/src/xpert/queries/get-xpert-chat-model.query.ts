import { ILLMUsage, IXpert, IXpertAgent } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'

/**
 * Create chatModel for xpert's agent
 */
export class GetXpertChatModelQuery implements IQuery {
	static readonly type = '[Xpert] Get chatModel for agent'

	constructor(
		public readonly xpert: IXpert,
		public readonly agent: IXpertAgent,
        public readonly options: {
			abortController?: AbortController;
			// tokenCallback?: (tokens: number) => void
			usageCallback: (tokens: ILLMUsage) => void
		}
	) {}
}
