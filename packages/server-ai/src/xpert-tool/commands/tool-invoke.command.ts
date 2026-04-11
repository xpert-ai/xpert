import { ICommand } from '@nestjs/cqrs'
import { IXpertTool } from '@xpert-ai/contracts'

export class ToolInvokeCommand implements ICommand {
	static readonly type = '[Xpert Tool] Invoke'

	constructor(
		public readonly tool: IXpertTool
	) {}
}
