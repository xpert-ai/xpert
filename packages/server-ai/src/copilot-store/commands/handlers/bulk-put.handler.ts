import { LongTermMemoryTypeEnum } from '@metad/contracts'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import { CopilotMemoryStore } from '../../store'
import { CopilotStoreBulkPutCommand } from '../bulk-put.command'
import { CreateCopilotStoreCommand } from '../create-store.command'

@CommandHandler(CopilotStoreBulkPutCommand)
export class CopilotStoreBulkPutHandler implements ICommandHandler<CopilotStoreBulkPutCommand> {
	constructor(private readonly commandBus: CommandBus) {}

	public async execute(command: CopilotStoreBulkPutCommand) {
		let fields = ['question']
		switch (command.type) {
			case LongTermMemoryTypeEnum.QA:
				fields = ['question']
				break
			case LongTermMemoryTypeEnum.PROFILE:
				fields = ['profile']
				break
		}
		const store = await this.commandBus.execute<CreateCopilotStoreCommand, CopilotMemoryStore>(
			new CreateCopilotStoreCommand({
				index: {
					dims: null,
					embeddings: command.embeddings,
					fields
				}
			})
		)

		for await (const memory of command.memories) {
			const memoryKey = uuidv4()
			await store.put(command.namespace, memoryKey, memory)
		}
	}
}
