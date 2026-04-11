import { ICopilotProvider } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

export class CopilotProviderUpsertCommand implements ICommand {
	static readonly type = '[Copilot Provider] Update or Insert'

	constructor(public readonly entity: Partial<ICopilotProvider>) { }
}
