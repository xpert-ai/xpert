import type { KnowledgebaseConnectAgentInput, KnowledgebaseConnectAgentResult } from '@xpert-ai/plugin-sdk'
import { Command } from '@nestjs/cqrs'

export class ConnectAgentKnowledgebasesCommand extends Command<KnowledgebaseConnectAgentResult> {
    static readonly type = '[Xpert Agent] Connect managed knowledgebases'

    constructor(public readonly input: KnowledgebaseConnectAgentInput) {
        super()
    }
}
