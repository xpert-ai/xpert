import { ChatConversationUpsertCommand } from '../upsert.command'
import { ChatConversationUpsertHandler } from './upsert.handler'
import { ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { ConversationInitializerRegistry } from '../../conversation-initializer.registry'

describe('ChatConversationUpsertHandler', () => {
    let tenantIdSpy: jest.SpyInstance
    let organizationIdSpy: jest.SpyInstance

    beforeAll(() => {
        tenantIdSpy = jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        organizationIdSpy = jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('organization-1')
    })

    afterAll(() => {
        tenantIdSpy.mockRestore()
        organizationIdSpy.mockRestore()
    })

    it('awaits runtime initialization before returning a newly created conversation', async () => {
        const created = { id: 'new-conversation', options: { parameters: { input: 'hello' } } }
        const service = {
            create: jest.fn().mockResolvedValue(created),
            repository: { findOne: jest.fn().mockResolvedValue(created) }
        }
        const initializers = new ConversationInitializerRegistry()
        initializers.register('test', async (conversation) => {
            await Promise.resolve()
            conversation.options = { ...conversation.options, sandboxEnvironmentId: 'chosen-environment' }
        })
        const handler = new ChatConversationUpsertHandler(service as never, initializers)
        const result = await handler.execute(new ChatConversationUpsertCommand({ status: 'busy' }))
        expect(result.options).toEqual({ parameters: { input: 'hello' }, sandboxEnvironmentId: 'chosen-environment' })
    })

    it('propagates initialization failures instead of running with an incomplete binding', async () => {
        const service = {
            create: jest.fn().mockResolvedValue({ id: 'new-conversation' }),
            repository: { findOne: jest.fn().mockResolvedValue({ id: 'new-conversation' }) }
        }
        const initializers = new ConversationInitializerRegistry()
        initializers.register('test', async () => {
            throw new Error('initialization failed')
        })
        const handler = new ChatConversationUpsertHandler(service as never, initializers)
        await expect(handler.execute(new ChatConversationUpsertCommand({ status: 'busy' }))).rejects.toThrow(
            'initialization failed'
        )
    })

    it('updates an existing conversation with a scope compare-and-set before reloading relations', async () => {
        const service = {
            repository: {
                existsBy: jest.fn(),
                findOne: jest
                    .fn()
                    .mockResolvedValueOnce({
                        id: 'conversation-1',
                        tenantId: 'tenant-1',
                        organizationId: 'organization-1',
                        projectId: 'project-1',
                        xpertId: 'xpert-1'
                    })
                    .mockResolvedValueOnce({
                        id: 'conversation-1',
                        title: 'Updated title'
                    })
            },
            update: jest.fn().mockResolvedValue(undefined),
            create: jest.fn(),
            assertAccess: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new ChatConversationUpsertHandler(service as never)

        const result = await handler.execute(
            new ChatConversationUpsertCommand(
                {
                    id: 'conversation-1',
                    title: 'Updated title',
                    tenantId: 'attacker-tenant',
                    organizationId: 'attacker-organization',
                    projectId: 'project-1',
                    xpertId: 'xpert-1'
                },
                ['messages']
            )
        )

        expect(service.update).toHaveBeenCalledWith(
            {
                id: 'conversation-1',
                tenantId: 'tenant-1',
                organizationId: 'organization-1'
            },
            { title: 'Updated title' }
        )
        expect(service.repository.findOne).toHaveBeenNthCalledWith(1, {
            where: {
                id: 'conversation-1',
                tenantId: 'tenant-1',
                organizationId: 'organization-1'
            }
        })
        expect(service.repository.existsBy).not.toHaveBeenCalled()
        expect(service.repository.findOne).toHaveBeenLastCalledWith(
            expect.objectContaining({ relations: ['messages'] })
        )
        expect(result).toEqual({
            id: 'conversation-1',
            title: 'Updated title'
        })
    })

    it('does not mutate or recreate a conversation id occupied outside the current tenant or Organization', async () => {
        const service = {
            repository: {
                existsBy: jest.fn().mockResolvedValue(true),
                findOne: jest.fn().mockResolvedValue(null)
            },
            update: jest.fn(),
            create: jest.fn(),
            assertAccess: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new ChatConversationUpsertHandler(service as never)

        await expect(
            handler.execute(
                new ChatConversationUpsertCommand({
                    id: 'conversation-in-another-scope',
                    status: 'busy'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.repository.existsBy).toHaveBeenCalledWith({ id: 'conversation-in-another-scope' })
        expect(service.repository.findOne).toHaveBeenCalledWith({
            where: {
                id: 'conversation-in-another-scope',
                tenantId: 'tenant-1',
                organizationId: 'organization-1'
            }
        })
        expect(service.update).not.toHaveBeenCalled()
        expect(service.create).not.toHaveBeenCalled()
    })

    it('creates a caller-preallocated id only when it is unused globally', async () => {
        const created = {
            id: 'new-conversation',
            tenantId: 'tenant-1',
            organizationId: 'organization-1',
            status: 'busy'
        }
        const service = {
            repository: {
                existsBy: jest.fn().mockResolvedValue(false),
                findOne: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(created)
            },
            update: jest.fn(),
            create: jest.fn().mockResolvedValue(created)
        }
        const handler = new ChatConversationUpsertHandler(service as never)

        await expect(
            handler.execute(
                new ChatConversationUpsertCommand({
                    id: 'new-conversation',
                    status: 'busy'
                })
            )
        ).resolves.toEqual(created)

        expect(service.create).toHaveBeenCalledWith({ id: 'new-conversation', status: 'busy' })
        expect(service.update).not.toHaveBeenCalled()
    })

    it.each([
        ['Project', { projectId: 'project-2' }],
        ['Xpert', { xpertId: 'xpert-2' }]
    ])('rejects changing the persisted %s binding', async (_binding, mutation) => {
        const service = {
            repository: {
                existsBy: jest.fn(),
                findOne: jest.fn().mockResolvedValue({
                    id: 'conversation-1',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    projectId: 'project-1',
                    xpertId: 'xpert-1'
                })
            },
            update: jest.fn(),
            create: jest.fn(),
            assertAccess: jest.fn().mockResolvedValue(undefined)
        }
        const handler = new ChatConversationUpsertHandler(service as never)

        await expect(
            handler.execute(new ChatConversationUpsertCommand({ id: 'conversation-1', ...mutation }))
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.update).not.toHaveBeenCalled()
    })

    it('rejects updating a conversation that the current caller cannot manage', async () => {
        const service = {
            repository: {
                existsBy: jest.fn(),
                findOne: jest.fn().mockResolvedValue({
                    id: 'victim-conversation',
                    tenantId: 'tenant-1',
                    organizationId: 'organization-1',
                    createdById: 'victim-user'
                })
            },
            update: jest.fn(),
            create: jest.fn(),
            assertAccess: jest.fn().mockRejectedValue(new ForbiddenException())
        }
        const handler = new ChatConversationUpsertHandler(service as never)

        await expect(
            handler.execute(
                new ChatConversationUpsertCommand({
                    id: 'victim-conversation',
                    title: 'Compromised'
                })
            )
        ).rejects.toBeInstanceOf(ForbiddenException)

        expect(service.assertAccess).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'victim-conversation' }),
            'manage'
        )
        expect(service.update).not.toHaveBeenCalled()
    })
})
