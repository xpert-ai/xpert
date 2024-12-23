import { ICommand } from '@nestjs/cqrs'

export class CopilotStorePutCommand implements ICommand {
	static readonly type = '[Copilot Store] Put'

	constructor() {}
}
