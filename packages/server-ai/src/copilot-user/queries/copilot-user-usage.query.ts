import { IQuery } from '@nestjs/cqrs'

/**
 * PRO: Statistics copilot user usage by currency
 */
export class CopilotUserUsageQuery implements IQuery {
	static readonly type = '[CopilotUser] Usage'

	constructor(
		public readonly params: {
			userId?: string
			xpertId?: string
			start?: string
			end?: string
			threadId?: string
		}
	) {}
}
