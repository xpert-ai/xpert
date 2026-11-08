import { groupResourceEvents } from './group-resource-events'
import type { ChatGroupMessage } from '@xpert-ai/contracts'

describe('live group resource navigation', () => {
    const now = Date.now()
    const message: ChatGroupMessage = {
        id: 'message',
        clientMessageId: 'message',
        sequence: 1,
        text: 'Inventory',
        createdAt: new Date(now).toISOString(),
        deliveries: [],
        communication: {
            intent: 'message',
            senderId: 'assistant',
            recipientIds: [],
            rootMessageId: 'human-message',
            rootUserId: 'user',
            hop: 1,
            resourceLinks: [{ referenceId: 'reference', projectId: 'usage-project', title: 'Inventory' }],
            resourceNavigation: {
                requestId: 'request',
                issuedAt: now,
                clientMessageId: 'local-message',
                participantId: 'viewer'
            }
        }
    }
    it('targets the requester once and leaves clickable history inert after reconnect', () => {
        const events = groupResourceEvents('viewer', now - 1)
        expect(events([message])).toEqual([
            {
                referenceId: 'reference',
                projectId: 'usage-project',
                title: 'Inventory',
                requestId: 'request',
                clientMessageId: 'local-message'
            }
        ])
        expect(events([message])).toEqual([])
        expect(groupResourceEvents('other-member', now - 1)([message])).toEqual([])
        expect(groupResourceEvents('viewer', now + 1)([message])).toEqual([])
    })
    it('never selects between multiple entries or navigates from ordinary text', () => {
        const events = groupResourceEvents('viewer', now - 1)
        expect(
            events([
                {
                    ...message,
                    communication: {
                        ...message.communication,
                        resourceLinks: [...message.communication.resourceLinks, ...message.communication.resourceLinks]
                    }
                }
            ])
        ).toEqual([])
        expect(
            events([{ ...message, communication: { ...message.communication, resourceNavigation: undefined } }])
        ).toEqual([])
    })
})
