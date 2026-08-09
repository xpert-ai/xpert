import { IKnowledgeDocument, KnowledgeDocumentProcessingMode } from '@xpert-ai/contracts'
import { ICommand } from '@nestjs/cqrs'

/**
 * Load knowledge document entity as langchain Document objects.
 */
export class KnowledgeDocLoadCommand implements ICommand {
    static readonly type = '[KnowledgeDocument] Load'

    constructor(
        public readonly input: {
            doc: IKnowledgeDocument
            stage: 'test' | 'prod'
            /** Defaults to `full`; `rechunk` resumes from the persisted transformer snapshot. */
            mode?: KnowledgeDocumentProcessingMode
        }
    ) {}
}
