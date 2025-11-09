import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { Knowledgebase } from '../../knowledgebase.entity'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgebaseGetOneQuery } from '../get-one.query'

@QueryHandler(KnowledgebaseGetOneQuery)
export class KnowledgebaseGetOneHandler implements IQueryHandler<KnowledgebaseGetOneQuery> {
	private readonly logger = new Logger(KnowledgebaseGetOneHandler.name)

	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(command: KnowledgebaseGetOneQuery): Promise<Knowledgebase> {
		const { id, options } = command.input
		return await this.knowledgebaseService.findOne(id, options)
	}
}
