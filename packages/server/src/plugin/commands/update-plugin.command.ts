import { ICommand } from '@nestjs/cqrs'

export class UpdatePluginCommand implements ICommand {
	static readonly type = '[Plugin] Update'

	constructor(public readonly pluginName: string) {}
}
