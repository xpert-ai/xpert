jest.mock('yargs', () => ({ __esModule: true, default: () => ({ argv: {} }) }))
import { UserType } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ResolveUserOrganizationAccessCommand } from '@xpert-ai/server-core'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'

describe('execution target authorization without model access', () => {
    function fixture() {
        const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'user' }
        const assistant = {
            id: 'runtime-assistant',
            tenantId: 'tenant',
            organizationId: 'org',
            workspaceId: 'workspace'
        }
        const conversation = { id: 'conversation', projectId: 'project', xpert: { id: 'coordinator' } }
        const conversations = { findOne: jest.fn(async () => conversation) }
        const published = { getAccessiblePublishedXpert: jest.fn(async () => assistant) }
        const commandBus = { execute: jest.fn(async () => ({ id: actor.userId, type: UserType.USER })) }
        const access = {
            canUseCatalogModels: jest.fn(async () => {
                throw new Error('model catalog unavailable')
            }),
            getCatalogModelLabels: jest.fn(async () => {
                throw new Error('model catalog unavailable')
            })
        }
        const modelRepository = { findOneBy: jest.fn(), findOne: jest.fn() }
        const native = { metadata: jest.fn() }
        const service = new AssistantExecutionPolicyService(
            conversations as never,
            commandBus as never,
            modelRepository as never,
            modelRepository as never,
            modelRepository as never,
            access as never,
            published as never,
            native as never
        )
        const runtimeAssistant = { id: assistant.id, workspaceId: assistant.workspaceId }
        return {
            service,
            actor,
            assistant,
            conversation,
            conversations,
            published,
            access,
            modelRepository,
            native,
            runtimeAssistant
        }
    }

    it('authorizes the binding target instead of the coordinator without consulting models or credentials', async () => {
        const f = fixture()
        const result = await f.service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)
        expect(result.assistant).toBe(f.assistant)
        expect(f.published.getAccessiblePublishedXpert).toHaveBeenCalledWith('runtime-assistant', expect.any(Object))
        expect(f.conversations.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'conversation',
                    tenantId: 'tenant',
                    organizationId: 'org',
                    createdById: 'user'
                }
            })
        )
        expect(f.access.canUseCatalogModels).not.toHaveBeenCalled()
        expect(f.access.getCatalogModelLabels).not.toHaveBeenCalled()
        expect(f.modelRepository.findOneBy).not.toHaveBeenCalled()
        expect(f.modelRepository.findOne).not.toHaveBeenCalled()
        expect(f.native.metadata).not.toHaveBeenCalled()
    })

    it('uses the current conversation Assistant for non-project execution targets', async () => {
        const f = fixture()
        f.published.getAccessiblePublishedXpert.mockResolvedValueOnce({ ...f.assistant, id: 'coordinator' })
        const result = await f.service.resolveTarget(f.actor, 'conversation')
        expect(result.assistant.id).toBe('coordinator')
        expect(f.published.getAccessiblePublishedXpert).toHaveBeenCalledWith('coordinator', expect.any(Object))
    })

    it('rechecks published Assistant access on every call while the conversation stays accessible', async () => {
        const f = fixture()
        await f.service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)
        f.published.getAccessiblePublishedXpert.mockRejectedValueOnce(new Error('Assistant access revoked'))
        await expect(f.service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)).rejects.toThrow(
            'Assistant access revoked'
        )
        expect(f.published.getAccessiblePublishedXpert).toHaveBeenCalledTimes(2)
    })

    it('rejects a binding target outside its recorded workspace', async () => {
        const f = fixture()
        f.assistant.workspaceId = 'another-workspace'
        await expect(f.service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)).rejects.toThrow()
    })

    it('rejects binding-directed execution when the conversation is no longer a Project conversation', async () => {
        const f = fixture()
        f.conversation.projectId = ''
        await expect(f.service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)).rejects.toThrow()
        expect(f.published.getAccessiblePublishedXpert).not.toHaveBeenCalled()
    })

    it('restores the resolved communication audience for target and model checks without leaking context', async () => {
        const f = fixture()
        const user = { id: f.actor.userId, tenantId: f.actor.tenantId, type: UserType.COMMUNICATION }
        const assertAudience = () => {
            expect(RequestContext.currentUser()).toEqual(user)
            expect(RequestContext.getOrganizationId()).toBe(f.actor.organizationId)
        }
        const commandBus = {
            execute: jest.fn(async (command: object) =>
                command instanceof ResolveUserOrganizationAccessCommand ? null : { user, assistant: f.assistant }
            )
        }
        const access = {
            canUseCatalogModels: jest.fn(async () => {
                assertAudience()
                return []
            }),
            getCatalogModelLabels: jest.fn(async () => {
                assertAudience()
                return []
            })
        }
        const conversations = {
            findOne: jest.fn(async () => {
                assertAudience()
                return f.conversation
            })
        }
        const service = new AssistantExecutionPolicyService(
            conversations as never,
            commandBus as never,
            f.modelRepository as never,
            f.modelRepository as never,
            f.modelRepository as never,
            access as never,
            f.published as never,
            f.native as never
        )
        const previousUser = RequestContext.currentUser()
        await expect(service.resolveTarget(f.actor, 'conversation', f.runtimeAssistant)).resolves.toMatchObject({
            assistant: f.assistant
        })
        expect(access.canUseCatalogModels).not.toHaveBeenCalled()
        await service.resolve(f.actor, 'conversation', false, false, f.runtimeAssistant)
        expect(access.canUseCatalogModels).toHaveBeenCalledTimes(1)
        expect(f.published.getAccessiblePublishedXpert).not.toHaveBeenCalled()
        expect(RequestContext.currentUser()).toBe(previousUser)
    })
})
