import { ICommand } from '@nestjs/cqrs'

export const JOB_KNOWLEDGE_QUESTIONS = 'knowledge-questions'
export type KnowledgeQuestionsJob = {
    documentId: string
    userId: string
    chunkId?: string
    force?: boolean
    tenantId?: string
    organizationId?: string
}

export class KnowledgeQuestionsEnqueueCommand implements ICommand {
    constructor(public readonly input: KnowledgeQuestionsJob) {}
}
