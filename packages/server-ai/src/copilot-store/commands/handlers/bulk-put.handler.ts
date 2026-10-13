import { LongTermMemoryTypeEnum } from '@xpert-ai/contracts'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import { CopilotMemoryStore } from '../../store'
import { CopilotStoreBulkPutCommand } from '../bulk-put.command'
import { CreateCopilotStoreCommand } from '../create-store.command'

@CommandHandler(CopilotStoreBulkPutCommand)
export class CopilotStoreBulkPutHandler implements ICommandHandler<CopilotStoreBulkPutCommand> {
    constructor(private readonly commandBus: CommandBus) {}

    public async execute(command: CopilotStoreBulkPutCommand) {
        if (command.keys && (command.keys.length !== command.memories.length || command.keys.some((key) => !key)))
            throw new Error('Memory keys must match the imported memories')
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

        for (const [index, memory] of command.memories.entries()) {
            const memoryKey = command.keys?.[index] ?? uuidv4()
            await store.put(command.namespace, memoryKey, memory)
        }
    }
}
