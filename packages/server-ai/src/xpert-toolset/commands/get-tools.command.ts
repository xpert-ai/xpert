import { ICommand } from '@nestjs/cqrs'

export class ToolsetGetToolsCommand implements ICommand {
	static readonly type = '[Xpert Toolset] Get tools'

	constructor(
		public readonly ids: string[],
		public readonly environment?: {
			projectId?: string
			conversationId: string
			xpertId: string
			agentKey?: string
			signal: AbortSignal
			env: Record<string, unknown>
		}
	) {}
}
