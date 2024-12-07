import { ICommand } from '@nestjs/cqrs'
import type { paths, components } from "../schemas/agent-protocol-schema"

/**
 */
export class RunCreateStreamCommand implements ICommand {
	static readonly type = '[Agent Protocol] Create run stream'

	constructor(
		public readonly threadId: string,
		public readonly input: components['schemas']['RunCreateStateful']
	) {}
}
