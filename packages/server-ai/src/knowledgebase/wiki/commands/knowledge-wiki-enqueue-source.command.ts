import { ICommand } from '@nestjs/cqrs'
import { KnowledgeWikiEnqueueSourceInput } from '../types'

export class KnowledgeWikiEnqueueSourceCommand implements ICommand {
    static readonly type = '[KnowledgeWiki] Enqueue Source'

    constructor(public readonly input: KnowledgeWikiEnqueueSourceInput) {}
}
