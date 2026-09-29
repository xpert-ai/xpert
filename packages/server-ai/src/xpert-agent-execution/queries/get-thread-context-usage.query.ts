import { Query } from '@nestjs/cqrs'

export type TThreadContextUsage = {
    thread_id: string
    agent_key: string | null
    run_id: string | null
    updated_at: string | null
    /** Whether the last measured input still describes the latest execution. */
    status: 'current' | 'stale' | 'unavailable'
    usage: {
        context_tokens: number
        input_tokens: number
        output_tokens: number
        total_tokens: number
        embed_tokens: number
        total_price: number
        currency: string | null
    }
}

export class GetThreadContextUsageQuery extends Query<TThreadContextUsage> {
    static readonly type = '[Xpert Agent Execution] Get thread context usage'

    constructor(
        public readonly threadId: string,
        public readonly agentKey?: string
    ) {
        super()
    }
}
