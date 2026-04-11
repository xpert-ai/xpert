import { ICopilot } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CopilotCheckLimitCommand implements ICommand {
	static readonly type = '[Copilot] Check limit'

	constructor(
		public readonly input: {
			tenantId: string;
			organizationId?: string;
			userId: string;
			copilot?: ICopilot;
			model: string
		}
	) {}
}
