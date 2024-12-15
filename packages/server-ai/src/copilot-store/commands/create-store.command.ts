import { ICommand } from '@nestjs/cqrs'

export class CreateCopilotStoreCommand implements ICommand {
	static readonly type = '[Copilot Store] Create one instance'

	constructor() {}
}
