import type { EntityManager } from 'typeorm'
import { callEndedRecord, persistCallEnded } from './voice-call-history'
import { RealtimeVoiceSession } from './voice.entity'

describe('voice call timeline persistence', () => {
    const session = {
        id: 'call-1',
        threadId: 'thread-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        userId: 'user-1',
        scope: { conversationId: 'conversation-1' },
        startedAt: new Date('2026-10-05T01:00:00Z'),
        usageState: 'pending'
    } as RealtimeVoiceSession
    it('uses connected duration and reports zero for calls canceled before ready', () => {
        const end = new Date('2026-10-05T01:01:17Z')
        expect(callEndedRecord(session, end).content.durationSeconds).toBe(77)
        expect(callEndedRecord({ ...session, startedAt: null }, end).content.durationSeconds).toBe(0)
    })
    it('records once, preserves the first end time and never downgrades usage', async () => {
        let row = { ...session }
        const sessions = {
            findOneOrFail: jest.fn(async () => ({ ...row })),
            update: jest.fn(async (_id, patch) => {
                row = { ...row, ...patch }
            })
        }
        const messages = { insert: jest.fn() }
        const manager = {
            getRepository: (entity) => (entity === RealtimeVoiceSession ? sessions : messages)
        } as unknown as EntityManager
        const first = await persistCallEnded(manager, session, 'reported', new Date('2026-10-05T01:01:17Z'))
        const repeated = await persistCallEnded(manager, session, 'incomplete', new Date('2026-10-05T01:02:00Z'))
        expect(repeated).toEqual(first)
        expect(row.usageState).toBe('reported')
        expect(messages.insert).toHaveBeenCalledTimes(1)
        expect(messages.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                id: session.id,
                createdInThreadId: session.threadId,
                inputCheckpoint: null,
                content: [first.content]
            })
        )
        expect(sessions.findOneOrFail).toHaveBeenCalledWith(
            expect.objectContaining({
                lock: { mode: 'pessimistic_write' },
                where: expect.objectContaining({ userId: session.userId, organizationId: session.organizationId })
            })
        )
    })
})
