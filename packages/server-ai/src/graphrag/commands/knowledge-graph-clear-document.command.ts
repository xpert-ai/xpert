import { ICommand } from '@nestjs/cqrs'

export class KnowledgeGraphClearDocumentCommand implements ICommand {
    static readonly type = '[KnowledgeGraph] Clear Document'

    constructor(
        public readonly input: {
            knowledgebaseId: string
            documentId: string
        }
    ) {}
}
