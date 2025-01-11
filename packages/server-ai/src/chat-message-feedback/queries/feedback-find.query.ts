import { IChatMessageFeedback } from '@metad/contracts'
import { IQuery } from '@nestjs/cqrs'
import { FindConditions } from 'typeorm'

/**
 * Find feedbacks by conditions
 */
export class FindMessageFeedbackQuery implements IQuery {
	static readonly type = '[Chat Message Feedback] Find all'

	constructor(
		public readonly conditions: FindConditions<IChatMessageFeedback>,
		public readonly relations?: string[]
	) {}
}
