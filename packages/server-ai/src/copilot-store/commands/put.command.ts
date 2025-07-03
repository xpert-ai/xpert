import { ICommand } from '@nestjs/cqrs'

/**
 * @deprecated 没有用到的命令
 */
export class CopilotStorePutCommand implements ICommand {
	static readonly type = '[Copilot Store] Put'

	constructor() {}
}
