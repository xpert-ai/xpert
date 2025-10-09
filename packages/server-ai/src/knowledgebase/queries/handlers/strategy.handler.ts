import { Inject, Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import {
	DocumentSourceRegistry,
	DocumentTransformerRegistry,
	ImageUnderstandingRegistry,
	TextSplitterRegistry
} from '@xpert-ai/plugin-sdk'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgeStrategyQuery } from '../strategy.query'

@QueryHandler(KnowledgeStrategyQuery)
export class KnowledgeStrategyHandler implements IQueryHandler<KnowledgeStrategyQuery> {
	private readonly logger = new Logger(KnowledgeStrategyHandler.name)

	@Inject(TextSplitterRegistry)
	private readonly chunkerRegistry: TextSplitterRegistry

	@Inject(DocumentTransformerRegistry)
	private readonly transformerRegistry: DocumentTransformerRegistry

	@Inject(ImageUnderstandingRegistry)
	private readonly understandingRegistry: ImageUnderstandingRegistry

	@Inject(DocumentSourceRegistry)
	private readonly docSourceRegistry: DocumentSourceRegistry

	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(command: KnowledgeStrategyQuery) {
		const { type, name } = command.input

		switch (type) {
			case 'chunker':
				return this.chunkerRegistry.get(name)
			case 'processor':
				return this.transformerRegistry.get(name)
			case 'understanding':
				return this.understandingRegistry.get(name)
			case 'source':
				return this.docSourceRegistry.get(name)
			default:
				throw new Error(`Unknown strategy type: ${type}`)
		}
	}
}
