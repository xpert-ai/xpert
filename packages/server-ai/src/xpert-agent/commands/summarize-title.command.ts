import { ICopilot, IXpert } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Create a agent for summarize a title for channel's messages
 */
export class CreateSummarizeTitleAgentCommand implements ICommand {
	static readonly type = '[Xpert Agent] Create summarize title Agent'

	constructor(
		public readonly options: {
            xpert?: IXpert;
            copilot?: ICopilot;
            rootController: AbortController; 
            rootExecutionId: string; 
            channel: string;
		}
	) {}
}
