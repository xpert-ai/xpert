import { ICommand } from '@nestjs/cqrs'

export const JOB_KNOWLEDGE_AUTO_TAGGING = 'knowledge-automatic-tagging'
export type KnowledgeAutoTaggingJob = {
    knowledgebaseId: string
    documentId: string
    userId: string
    tenantId?: string
    organizationId?: string
}

export class KnowledgeAutoTaggingEnqueueCommand implements ICommand {
    constructor(public readonly input: KnowledgeAutoTaggingJob) {}
}
