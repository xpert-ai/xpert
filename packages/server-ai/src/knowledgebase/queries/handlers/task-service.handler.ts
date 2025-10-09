import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { KnowledgebaseTaskService } from '../../task/task.service'
import { KnowledgeTaskServiceQuery } from '../task-service.query'

@QueryHandler(KnowledgeTaskServiceQuery)
export class KnowledgeTaskServiceHandler implements IQueryHandler<KnowledgeTaskServiceQuery> {
	private readonly logger = new Logger(KnowledgeTaskServiceHandler.name)

	constructor(private readonly knowledgeTaskService: KnowledgebaseTaskService) {}

	public async execute(command: KnowledgeTaskServiceQuery) {
		return this.knowledgeTaskService
	}
}
