import { Command } from '@nestjs/cqrs'
import type { components } from "../schemas/agent-protocol-schema"
import { ThreadDTO } from '../dto'

/**
 * Create a Thread
 */
export class ThreadCreateCommand extends Command<ThreadDTO> {
	static readonly type = '[Agent Protocol] Thread Create'

	constructor(
		public readonly input: components['schemas']['ThreadCreate']
	) {
		super()
	}
}
