import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { KnowledgeWikiRetractionService } from '../../knowledge-wiki-retraction.service'
import { KnowledgeWikiRetractSourceCommand } from '../knowledge-wiki-retract-source.command'

@CommandHandler(KnowledgeWikiRetractSourceCommand)
export class KnowledgeWikiRetractSourceHandler implements ICommandHandler<KnowledgeWikiRetractSourceCommand> {
    constructor(private readonly service: KnowledgeWikiRetractionService) {}

    execute(command: KnowledgeWikiRetractSourceCommand) {
        return this.service.enqueue(command.input)
    }
}
