import { randomUUID } from 'node:crypto'
import {
    groupCandidatesSchema,
    groupHistorySchema,
    groupHumanSendSchema,
    groupSendSchema,
    parseGroupCommunication
} from './group.schema'

describe('group request boundaries', () => {
    const participantId = randomUUID()
    const clientMessageId = randomUUID()

    it('preserves human text offsets and does not accept client-authored routing or identity', () => {
        const input = {
            clientMessageId,
            text: '  @Expert hello  ',
            mentions: [{ participantId, start: 2, end: 9 }]
        }
        expect(groupHumanSendSchema.parse(input)).toEqual(input)
        for (const extra of [
            { senderId: participantId },
            { rootUserId: randomUUID() },
            { recipientIds: [participantId] },
            { intent: 'message' },
            { mode: 'queue' }
        ]) {
            expect(groupHumanSendSchema.safeParse({ ...input, ...extra }).success).toBe(false)
        }
        expect(groupHumanSendSchema.safeParse({ clientMessageId, text: '  \n ' }).success).toBe(false)
    })

    it('keeps runtime request, reply and informational-message shapes distinct', () => {
        const base = { clientMessageId, text: 'hello' }
        expect(groupSendSchema.safeParse({ ...base, intent: 'request', recipientIds: [participantId] }).success).toBe(
            true
        )
        expect(groupSendSchema.safeParse({ ...base, intent: 'message', recipientIds: [] }).success).toBe(true)
        expect(groupSendSchema.safeParse({ ...base, intent: 'reply', replyToMessageId: randomUUID() }).success).toBe(
            true
        )
        for (const shape of [
            { intent: 'request', recipientIds: [] },
            { intent: 'request', recipientIds: [participantId, participantId] },
            { intent: 'reply', recipientIds: [participantId] },
            { intent: 'reply', replyToMessageId: randomUUID(), recipientIds: [participantId] }
        ]) {
            expect(groupSendSchema.safeParse({ ...base, ...shape }).success).toBe(false)
        }
    })

    it('rejects private runtime and actor overrides inside Composer selections', () => {
        const base = { clientMessageId, text: 'hello' }
        const composer = { participantId, projectId: randomUUID(), runtimeResources: { revision: 0, resources: [] } }
        expect(groupHumanSendSchema.safeParse({ ...base, composer }).success).toBe(true)
        for (const extra of [
            { runtimeConversationId: randomUUID() },
            { userId: randomUUID() },
            { files: [{ url: 'https://example.test/arbitrary-file' }] }
        ]) {
            expect(groupHumanSendSchema.safeParse({ ...base, composer: { ...composer, ...extra } }).success).toBe(false)
        }
    })

    it('normalizes pagination and candidate queries while rejecting unbounded history requests', () => {
        expect(groupHistorySchema.parse({ before: '42', limit: '20' })).toEqual({ before: 42, limit: 20 })
        expect(groupHistorySchema.parse({})).toEqual({ limit: 50 })
        for (const query of [{ limit: 101 }, { before: 0 }, { before: 1.5 }, { after: 1 }]) {
            expect(groupHistorySchema.safeParse(query).success).toBe(false)
        }
        expect(groupCandidatesSchema.parse({})).toEqual({ kind: 'assistant', search: '' })
        expect(groupCandidatesSchema.parse({ kind: 'user', search: ' Alice ' })).toEqual({
            kind: 'user',
            search: 'Alice'
        })
    })

    it('validates persisted communication before using its causal identity', () => {
        const communication = {
            intent: 'request',
            senderId: participantId,
            recipientIds: [randomUUID()],
            rootMessageId: randomUUID(),
            rootUserId: randomUUID(),
            hop: 0
        }
        expect(parseGroupCommunication(communication)).toEqual(communication)
        for (const extra of [
            { rootUserId: undefined },
            { hop: 9 },
            { senderId: 'display-name' },
            { privateConfig: {} }
        ]) {
            expect(() => parseGroupCommunication({ ...communication, ...extra })).toThrow()
        }
    })
})
