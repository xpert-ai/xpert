import type { CollaborationSession } from './collaboration.service'
import { CollaborationGateway } from './collaboration.gateway'

describe('CollaborationGateway', () => {
    it('identifies the exact socket in the initial presence snapshot', async () => {
        const session: CollaborationSession = {
            sessionId: 'session',
            clientKeyHash: 'hash',
            documentId: 'document',
            providerKey: 'example.document',
            resourceId: 'resource',
            access: 'write',
            actor: { presenceId: 'user-1', actorType: 'user', displayName: 'User', color: '#111111' },
            expiresAt: Date.now() + 60_000,
            tenantId: 'tenant',
            organizationId: 'organization'
        }
        const collaboration = {
            onBroadcast: jest.fn(() => () => undefined),
            resolveSession: jest.fn(async () => session),
            getStateForSession: jest.fn(async () => ({ updateBase64: '', stateVectorBase64: '' })),
            listPresenceForSession: jest.fn(async () => [])
        }
        const emitted: Array<{ event: string; payload: object }> = []
        const client = {
            id: 'socket-self',
            handshake: { auth: { sessionId: 'session', clientKey: 'key', documentId: 'document' }, query: {} },
            join: jest.fn(async () => undefined),
            emit: jest.fn((event: string, payload: object) => emitted.push({ event, payload })),
            disconnect: jest.fn()
        }

        const gateway = new CollaborationGateway(collaboration as never)
        await gateway.handleConnection(client as never)

        expect(emitted).toContainEqual({
            event: 'presence-snapshot',
            payload: { selfClientId: 'socket-self', items: [] }
        })
    })
})
