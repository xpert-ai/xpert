import type { IXpert } from '@xpert-ai/contracts'
import { ForbiddenException } from '@nestjs/common'
import { ChatConversationService } from './conversation.service'
import { WorkbenchAssistantConversationNavigationService } from './workbench-assistant-conversation-navigation.service'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'

describe('WorkbenchAssistantConversationNavigationService', () => {
    const requester = createXpert('orchestrator-current', 'factory-orchestrator', {
        agentKey: 'Agent_Orchestrator',
        externalXpertIds: ['role-assistant-old']
    })
    const target = createXpert('role-assistant-current', 'equipment-diagnostics')
    const unrelated = createXpert('unrelated-assistant-current', 'unrelated')

    let conversationService: ChatConversationService
    let projectAccessService: XpertProjectAccessService
    let xpertBindingService: XpertProjectXpertBindingService
    let service: WorkbenchAssistantConversationNavigationService
    let assertAccess: jest.Mock
    let assertCanReadXpert: jest.Mock
    let resolveCurrentById: jest.Mock

    beforeEach(() => {
        assertAccess = jest.fn().mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'role-assistant-old',
            projectId: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })
        assertCanReadXpert = jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        resolveCurrentById = jest.fn(async (id: string) => {
            if (id === 'orchestrator-old' || id === requester.id) return requester
            if (id === 'role-assistant-old' || id === target.id) return target
            if (id === unrelated.id) return unrelated
            return null
        })
        conversationService = Object.assign(Object.create(ChatConversationService.prototype), { assertAccess })
        projectAccessService = Object.assign(Object.create(XpertProjectAccessService.prototype), {
            assertCanReadXpert
        })
        xpertBindingService = Object.assign(Object.create(XpertProjectXpertBindingService.prototype), {
            resolveCurrentById,
            isSameXpert: (left: IXpert, right: IXpert) => left.slug === right.slug
        })
        service = new WorkbenchAssistantConversationNavigationService(
            conversationService,
            projectAccessService,
            xpertBindingService
        )
    })

    it('resolves canonical target Assistant, Project and thread from the authorized conversation', async () => {
        await expect(service.resolve('conversation-1', 'orchestrator-old')).resolves.toEqual({
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'role-assistant-current',
            projectId: 'project-1',
            isExternalAssistant: true
        })

        expect(assertAccess).toHaveBeenCalledWith('conversation-1')
        expect(assertCanReadXpert).toHaveBeenCalledWith('project-1', 'orchestrator-old')
        expect(assertCanReadXpert).toHaveBeenCalledWith('project-1', 'role-assistant-old')
        expect(resolveCurrentById).toHaveBeenCalledWith('role-assistant-old', {
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })
    })

    it('rejects a Project Assistant that is not directly connected to the requester Agent', async () => {
        assertAccess.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: unrelated.id,
            projectId: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })

        await expect(service.resolve('conversation-1', requester.id)).rejects.toBeInstanceOf(ForbiddenException)
    })

    it('keeps a conversation in the requester Assistant family non-external', async () => {
        assertAccess.mockResolvedValue({
            id: 'conversation-1',
            threadId: 'thread-1',
            xpertId: 'orchestrator-old',
            projectId: 'project-1',
            tenantId: 'tenant-1',
            organizationId: 'organization-1'
        })

        await expect(service.resolve('conversation-1', requester.id)).resolves.toEqual({
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            xpertId: requester.id,
            projectId: 'project-1',
            isExternalAssistant: false
        })
    })
})

function createXpert(
    id: string,
    slug: string,
    options: { agentKey?: string; externalXpertIds?: string[] } = {}
): IXpert {
    const agentKey = options.agentKey ?? 'Agent_Primary'
    const externalXpertIds = options.externalXpertIds ?? []
    return {
        id,
        tenantId: 'tenant-1',
        organizationId: 'organization-1',
        workspaceId: 'workspace-1',
        type: 'agent',
        slug,
        name: slug,
        graph: {
            nodes: [
                { key: agentKey, type: 'agent' },
                ...externalXpertIds.map((xpertId) => ({ key: xpertId, type: 'xpert' as const }))
            ],
            connections: externalXpertIds.map((xpertId) => ({
                key: `${agentKey}:${xpertId}`,
                from: agentKey,
                to: xpertId,
                type: 'xpert' as const,
                required: true
            }))
        }
    } as IXpert
}
