import { STATE_VARIABLE_HUMAN } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Enqueues one trigger-driven chat dispatch request into the handoff pipeline.
 *
 * Design:
 * - Keeps enqueue input explicit (`xpertId`, `state`, runtime params) while
 *   moving side effects (user lookup, message construction, queue enqueue)
 *   into the dedicated handler.
 * - Decouples callers from queue details so multiple domains can submit
 *   trigger dispatches with a shared execution path.
 */
export class XpertEnqueueTriggerDispatchCommand implements ICommand {
	static readonly type = '[Xpert Trigger] Enqueue Trigger Dispatch'

	constructor(
		public readonly xpertId: string,
		public readonly userId: string,
		public readonly state: {
			[STATE_VARIABLE_HUMAN]: Record<string, any>
			[key: string]: any
		},
		public readonly params: {
			isDraft: boolean
			from: unknown
			executionId?: string
		}
	) {}
}
