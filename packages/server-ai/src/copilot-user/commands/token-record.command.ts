import { ICopilot } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CopilotTokenRecordCommand implements ICommand {
	static readonly type = '[Copilot] Record Token'

	constructor(
		public readonly input: {
			tenantId: string
			organizationId?: string
			userId: string
			copilotId?: string
			copilot?: ICopilot
			model?: string
			tokenUsed?: number
		}
	) {}
}
