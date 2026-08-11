import type { KnowledgebaseEnsureInput, KnowledgebaseEnsureResult } from '@xpert-ai/plugin-sdk'
import { Command } from '@nestjs/cqrs'

export class EnsureKnowledgebasesCommand extends Command<KnowledgebaseEnsureResult> {
    static readonly type = '[Knowledgebase] Ensure managed knowledgebases'

    constructor(public readonly input: KnowledgebaseEnsureInput) {
        super()
    }
}
