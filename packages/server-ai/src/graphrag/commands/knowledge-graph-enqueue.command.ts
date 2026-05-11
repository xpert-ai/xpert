import { ICommand } from '@nestjs/cqrs'
import { TKnowledgeGraphEnqueueInput } from '../types'

export class KnowledgeGraphEnqueueCommand implements ICommand {
    static readonly type = '[KnowledgeGraph] Enqueue Index'

    constructor(public readonly input: TKnowledgeGraphEnqueueInput) {}
}
