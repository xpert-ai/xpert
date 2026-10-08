// Timeline receipts live outside the model's message ancestry and do not advance its head.
import type { CompletedVoiceCall } from '@xpert-ai/contracts'
import type { EntityManager } from 'typeorm'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { RealtimeVoiceSession } from './voice.entity'

export function callEndedRecord(session: RealtimeVoiceSession, endedAt: Date): CompletedVoiceCall {
    return {
        id: session.id,
        threadId: session.threadId,
        content: {
            type: 'call_ended',
            sessionId: session.id,
            startedAt: session.startedAt?.toISOString() ?? null,
            endedAt: endedAt.toISOString(),
            durationSeconds: session.startedAt
                ? Math.max(0, Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000))
                : 0
        }
    }
}

export async function persistCallEnded(
    manager: EntityManager,
    session: RealtimeVoiceSession,
    usageState: 'reported' | 'incomplete',
    now = new Date()
): Promise<CompletedVoiceCall> {
    const sessions = manager.getRepository(RealtimeVoiceSession)
    const saved = await sessions.findOneOrFail({
        where: {
            id: session.id,
            tenantId: session.tenantId,
            organizationId: session.organizationId,
            userId: session.userId,
            threadId: session.threadId
        },
        lock: { mode: 'pessimistic_write' }
    })
    const record = callEndedRecord(saved, saved.endedAt ?? now)
    await sessions.update(saved.id, {
        status: 'ended',
        endedAt: new Date(record.content.endedAt),
        usageState: saved.usageState === 'reported' ? 'reported' : usageState
    })
    // The session lock serializes HTTP hangup, disconnect and delayed usage drain.
    if (!saved.endedAt) {
        await manager
            .getRepository(ChatMessage)
            .insert({
                id: saved.id,
                tenantId: saved.tenantId,
                organizationId: saved.organizationId,
                createdById: saved.userId,
                updatedById: saved.userId,
                conversationId: saved.scope.conversationId,
                createdInThreadId: saved.threadId,
                role: 'human',
                content: [record.content],
                inputCheckpoint: null,
                taskSummary: { version: 1 },
                createdAt: new Date(record.content.endedAt),
                updatedAt: new Date(record.content.endedAt)
            })
    }
    return record
}
