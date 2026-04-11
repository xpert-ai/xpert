import { IChatMessageFeedback } from '@xpert-ai/contracts'
import { FindOptionsWhere } from '@xpert-ai/server-core'
import { IQuery } from '@nestjs/cqrs'

/**
 * Find feedbacks by conditions
 */
export class FindMessageFeedbackQuery implements IQuery {
	static readonly type = '[Chat Message Feedback] Find all'

	constructor(
		public readonly conditions: FindOptionsWhere<IChatMessageFeedback>,
		public readonly relations?: string[]
	) {}
}
