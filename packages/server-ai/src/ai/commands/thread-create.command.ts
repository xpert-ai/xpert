import { ICommand } from '@nestjs/cqrs'
import type { paths, components } from "../schemas/agent-protocol-schema"

/**
 */
export class ThreadCreateCommand implements ICommand {
	static readonly type = '[Agent Protocol] Thread Create'

	constructor(
		public readonly input: components['schemas']['ThreadCreate']
	) {}
}
