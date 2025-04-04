import { IXpertToolset } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

export class MCPToolsBySchemaCommand implements ICommand {
	static readonly type = '[Xpert Toolset] Get MCP tools by schema'

	constructor(
		public readonly toolset: Partial<IXpertToolset>
	) {}
}
