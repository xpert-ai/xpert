import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { KnowledgeWikiGenerationService } from '../../knowledge-wiki-generation.service'
import { KnowledgeWikiEnqueueSourceCommand } from '../knowledge-wiki-enqueue-source.command'

@CommandHandler(KnowledgeWikiEnqueueSourceCommand)
export class KnowledgeWikiEnqueueSourceHandler implements ICommandHandler<KnowledgeWikiEnqueueSourceCommand> {
    constructor(private readonly service: KnowledgeWikiGenerationService) {}

    execute(command: KnowledgeWikiEnqueueSourceCommand) {
        return this.service.enqueueSource(command.input)
    }
}
