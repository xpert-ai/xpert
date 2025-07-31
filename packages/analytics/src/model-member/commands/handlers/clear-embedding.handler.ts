import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { PGMemberVectorStore } from '../../vector-store'
import { ClearEmbeddingMembersCommand } from '../clear-embedding.command'
import { CreateVectorStoreCommand } from '../create-vector-store.command'

@CommandHandler(ClearEmbeddingMembersCommand)
export class ClearEmbeddingMembersHandler implements ICommandHandler<ClearEmbeddingMembersCommand> {
	private logger = new Logger(ClearEmbeddingMembersHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ClearEmbeddingMembersCommand) {
		const { modelKey, cube } = command
		const { dimension, isDraft } = command.params ?? {}

		const id = `${modelKey}:${cube}` + (isDraft ? `:draft` : ``)
		const vectorStore = await this.commandBus.execute<CreateVectorStoreCommand, PGMemberVectorStore>(
			new CreateVectorStoreCommand(id)
		)
		if (dimension) {
			await vectorStore.deleteDimension(dimension)
		} else {
			await vectorStore.clear()
		}
	}
}
