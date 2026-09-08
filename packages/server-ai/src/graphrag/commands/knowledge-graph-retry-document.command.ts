import { ICommand } from '@nestjs/cqrs'

export class KnowledgeGraphRetryDocumentCommand implements ICommand {
    constructor(public readonly input: { knowledgebaseId: string; documentId: string; userId?: string | null }) {}
}
