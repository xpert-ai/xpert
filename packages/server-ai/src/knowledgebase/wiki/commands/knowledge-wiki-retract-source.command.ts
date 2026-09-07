import { ICommand } from '@nestjs/cqrs'
import { KnowledgeWikiRetractSourceInput } from '../types'

export class KnowledgeWikiRetractSourceCommand implements ICommand {
    static readonly type = '[KnowledgeWiki] Retract Source'

    constructor(public readonly input: KnowledgeWikiRetractSourceInput) {}
}
