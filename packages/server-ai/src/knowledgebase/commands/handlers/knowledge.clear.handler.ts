import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { KnowledgebaseService } from '../../knowledgebase.service'
import { KnowledgebaseClearCommand } from '../knowledge.clear.command'

@CommandHandler(KnowledgebaseClearCommand)
export class KnowledgebaseClearHandler implements ICommandHandler<KnowledgebaseClearCommand> {
	constructor(private readonly knowledgebaseService: KnowledgebaseService) {}

	public async execute(command: KnowledgebaseClearCommand): Promise<void> {
		const { entity } = command.input

		const vectorStore = await this.knowledgebaseService.getVectorStore(entity, false)

		await vectorStore.clear()
	}
}
