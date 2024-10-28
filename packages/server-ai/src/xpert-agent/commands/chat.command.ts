import { IXpert, IXpertAgentExecution } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * @constructor
 * 
 */
export class XpertAgentChatCommand implements ICommand {
	static readonly type = '[Xpert Agent] Chat'

	constructor(
		public readonly input: string,
		public readonly agentKey: string,
		
		public readonly xpert: IXpert,
		public readonly options: {
			// Use xpert's draft
			isDraft?: boolean
			// The id of root agent execution
			execution?: IXpertAgentExecution
		}
	) {}
}