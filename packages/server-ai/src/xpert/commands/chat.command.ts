import type { EventRunOptions } from '../../agent-event/agent-event-run-context'
import {
    IXpertAgentExecution,
    TChatMessageEnvelope,
    TChatOptions,
    TChatRequest,
    TChatSourceAuditOptions
} from '@xpert-ai/contracts'
import { Command } from '@nestjs/cqrs'
import { Observable } from 'rxjs'

export interface XpertChatStreamPersistenceOptions {
    transport: 'redis-stream'
    snapshotOwner?: string
    snapshotScope?: { tenantId: string; organizationId?: string | null }
    threadId?: string | null
    runId?: string | null
}

export class XpertChatCommand extends Command<Observable<MessageEvent>> {
    static readonly type = '[Xpert] Chat'

    constructor(
        public readonly request: TChatRequest,
        public readonly options?: TChatOptions &
            TChatSourceAuditOptions & EventRunOptions & {
                xpertId?: string
                /** Runtime branch id; defaults to the conversation's primary thread. */
                threadId?: string
                /** True when `threadId` is not the conversation's compatibility root. */
                isDerivedThread?: boolean
                /**
                 * Start this chat run at a specific Agent in the Assistant graph.
                 * When omitted, the published Assistant's primary Agent is used.
                 */
                agentKey?: string
                // Use xpert's draft
                isDraft?: boolean
                fromEndUserId?: string
                /** Trusted provenance and presentation; independent of routing, model role and permissions. */
                messageEnvelope?: TChatMessageEnvelope
                /** Host-reserved, single-use execution ID for a durable timer occurrence. */
                once?: boolean
                eventBinding?: { id: string; revision: number; fence: string }
                execution?: { id: string; metadata?: IXpertAgentExecution['metadata'] }
                streamPersistence?: XpertChatStreamPersistenceOptions
                /**
                 * Host-resolved skill selection for a platform Assistant Task.
                 * This is deliberately separate from the runtime-capabilities
                 * allowlist so selecting skills does not disable other middleware.
                 */
                assistantTaskSkillSelection?: {
                    workspaceId: string
                    skillIds: string[]
                }
            }
    ) {
        super()
    }
}
