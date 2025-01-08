import { IChatMessageFeedback } from '@metad/contracts'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { ChatMessageFeedbackService } from '../../feedback.service';
import { FindMessageFeedbackQuery } from '../feedback-find.query';

@QueryHandler(FindMessageFeedbackQuery)
export class FindMessageFeedbackHandler implements IQueryHandler<FindMessageFeedbackQuery> {
	constructor(private readonly service: ChatMessageFeedbackService) {}

	public async execute(command: FindMessageFeedbackQuery): Promise<{ items: IChatMessageFeedback[]; total: number;}> {
		return await this.service.findAll({ where: command.conditions, relations: command.relations })
	}
}
