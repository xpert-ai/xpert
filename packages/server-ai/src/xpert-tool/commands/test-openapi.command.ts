import { ICommand } from '@nestjs/cqrs'
import { IXpertTool } from '@xpert-ai/contracts'

export class TestOpenAPICommand implements ICommand {
	static readonly type = '[Xpert Tool] Test OpenAPI'

	constructor(
		public readonly tool: IXpertTool
	) {}
}
