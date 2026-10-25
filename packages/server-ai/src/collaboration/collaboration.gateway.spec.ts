import type { CollaborationSession } from './collaboration.service'
import { CollaborationGateway } from './collaboration.gateway'
import { RequestContext, runWithRequestContext } from '@xpert-ai/plugin-sdk'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { ContentDocumentAccess } from '../content-resource/documents/document-access.service'

describe('CollaborationGateway', () => {
    it('authorizes recipients independently of the HTTP writer without weakening request scope checks', async () => {
        let listener: (event: import('./collaboration.service').CollaborationBroadcast) => void = () => undefined
        const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }
        const principal = jest.fn(async () => actor)
        const assertAssistant = jest.fn(async () => ({ role: 'editor', archived: false }))
        const access = new ContentDocumentAccess({ assertAssistant } as never, { identities: { principal } } as never)
        const scope = { actor, projectId: 'project', assistantId: 'assistant' }
        const session = { sessionId: 'session', documentId: 'doc' }
        const service = {
            onBroadcast: (callback) => {
                listener = callback
                return () => undefined
            },
            resolveSession: async () => session,
            getStateForSession: async () => ({ updateBase64: '' }),
            listPresenceForSession: async () => [],
            assertSessionReadable: async () => access.check(scope)
        }
        const gateway = new CollaborationGateway(service as never)
        const client = {
            id: 'reader-client',
            handshake: { auth: { sessionId: 'session', clientKey: 'key', documentId: 'doc' }, query: {} },
            join: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn()
        }
        await gateway.handleConnection(client as never)
        client.emit.mockClear()
        const request = Object.assign(new IncomingMessage(new Socket()), { user: { id: 'writer', tenantId: 'tenant' } })
        request.headers['organization-id'] = 'org'
        let wrongActor: Promise<unknown>
        runWithRequestContext(request as never, {}, () => {
            // Ordinary HTTP calls may not substitute another actor, even in this regression test.
            wrongActor = expect(access.check(scope)).rejects.toThrow()
            listener({ nodeId: 'node', documentId: 'doc', type: 'update', payload: { updateBase64: 'delta' } })
            expect(RequestContext.currentUserId()).toBe('writer')
        })
        await wrongActor!
        await new Promise((resolve) => setImmediate(resolve))
        expect(principal).toHaveBeenCalledWith(actor)
        expect(assertAssistant).toHaveBeenCalledWith(scope)
        expect(client.emit).toHaveBeenCalledWith('update', { updateBase64: 'delta' })
        expect(client.disconnect).not.toHaveBeenCalled()
        gateway.onModuleDestroy()
    })
    it('rechecks each recipient before broadcasting and disconnects revoked readers', async () => {
        let listener: (event: import('./collaboration.service').CollaborationBroadcast) => void = () => undefined
        let revoked = false
        const session: CollaborationSession = {
            sessionId: 'session',
            clientKeyHash: 'hash',
            documentId: 'doc',
            providerKey: 'spaces.page',
            resourceId: 'page',
            access: 'read',
            expiresAt: Date.now() + 60000,
            tenantId: 'tenant',
            organizationId: 'org',
            userId: 'reader',
            actor: { presenceId: 'reader', actorType: 'user', displayName: 'Reader', color: '#111111' }
        }
        const service = {
            onBroadcast: jest.fn((callback) => {
                listener = callback
                return () => undefined
            }),
            resolveSession: jest.fn(async () => session),
            getStateForSession: jest.fn(async () => ({ updateBase64: '', sequenceNumber: 0 })),
            listPresenceForSession: jest.fn(async () => []),
            assertSessionReadable: jest.fn(async () => {
                if (revoked) throw new Error('revoked')
            })
        }
        const client = {
            id: 'client',
            handshake: { auth: { sessionId: 'session', clientKey: 'key', documentId: 'doc' }, query: {} },
            join: jest.fn(),
            emit: jest.fn(),
            disconnect: jest.fn()
        }
        const gateway = new CollaborationGateway(service as never)
        await gateway.handleConnection(client as never)
        client.emit.mockClear()
        const event: import('./collaboration.service').CollaborationBroadcast = {
            nodeId: 'node',
            documentId: 'doc',
            type: 'update',
            payload: { secret: 'content' }
        }
        listener(event)
        await new Promise((resolve) => setImmediate(resolve))
        expect(client.emit).toHaveBeenCalledWith('update', event.payload)
        client.emit.mockClear()
        revoked = true
        listener(event)
        await new Promise((resolve) => setImmediate(resolve))
        expect(client.emit).not.toHaveBeenCalled()
        expect(client.disconnect).toHaveBeenCalledWith(true)
        gateway.onModuleDestroy()
    })
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
