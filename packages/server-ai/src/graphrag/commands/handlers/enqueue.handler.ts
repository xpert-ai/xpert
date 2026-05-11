import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GraphragService } from '../../graphrag.service'
import { KnowledgeGraphEnqueueCommand } from '../knowledge-graph-enqueue.command'

@CommandHandler(KnowledgeGraphEnqueueCommand)
export class KnowledgeGraphEnqueueHandler implements ICommandHandler<KnowledgeGraphEnqueueCommand> {
    constructor(private readonly service: GraphragService) {}

    async execute(command: KnowledgeGraphEnqueueCommand) {
        return this.service.enqueueDocuments(command.input)
    }
}
