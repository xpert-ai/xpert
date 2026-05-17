import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { GraphragService } from '../../graphrag.service'
import { KnowledgeGraphClearDocumentCommand } from '../knowledge-graph-clear-document.command'

@CommandHandler(KnowledgeGraphClearDocumentCommand)
export class KnowledgeGraphClearDocumentHandler implements ICommandHandler<KnowledgeGraphClearDocumentCommand> {
    constructor(private readonly service: GraphragService) {}

    async execute(command: KnowledgeGraphClearDocumentCommand) {
        return this.service.clearDocument(command.input.knowledgebaseId, command.input.documentId)
    }
}
