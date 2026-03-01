import { IXpert, TXpertGraph } from '@metad/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Publishes all trigger nodes for a given xpert graph.
 *
 * Design:
 * - This command carries only immutable input data and no execution logic.
 * - It allows trigger publication to be reused from different entry points
 *   (startup recovery, manual publish flow) through one CQRS handler.
 * - `previousGraph` enables the handler to stop old trigger subscriptions
 *   before publishing the new graph state.
 */
export class XpertPublishTriggersCommand implements ICommand {
	static readonly type = '[Xpert Trigger] Publish Triggers'

	constructor(
		public readonly xpert: IXpert,
		public readonly options?: {
			strict?: boolean
			previousGraph?: TXpertGraph
			providers?: string[]
		}
	) {}
}
