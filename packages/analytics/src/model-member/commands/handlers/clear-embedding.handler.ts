import { Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { ClearEmbeddingMembersCommand } from '../clear-embedding.command'
import { CreateVectorStoreCommand } from '../create-vector-store.command'

@CommandHandler(ClearEmbeddingMembersCommand)
export class ClearEmbeddingMembersHandler implements ICommandHandler<ClearEmbeddingMembersCommand> {
	private logger = new Logger(ClearEmbeddingMembersHandler.name)

	constructor(
		private readonly commandBus: CommandBus,
	) {}

	public async execute(command: ClearEmbeddingMembersCommand) {
		const { modelKey, cube } = command
		const { dimension, isDraft } = command.params ?? {}

		const id = `${modelKey}:${cube}` + (isDraft ? `:draft` : ``)
		const {vectorStore} = await this.commandBus.execute(new CreateVectorStoreCommand(id))
		if (dimension) {
			await vectorStore.deleteDimension(dimension)
		} else {
			await vectorStore.clear()
		}
	}
}
