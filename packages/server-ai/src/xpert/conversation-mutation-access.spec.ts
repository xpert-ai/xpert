import { BadRequestException, ForbiddenException } from '@nestjs/common'
import type { IChatConversation } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { withGroupRuntime } from '../chat-group/group-runtime-context'
import { assertConversationMutationAccess, ConversationMutationInput } from './conversation-mutation-access'

describe('conversation mutation access', () => {
    const published = { getAccessiblePublishedXpertFamilyIds: jest.fn() }
    const projects = { assertRuntimeAccess: jest.fn() }
    let conversation: IChatConversation
    const check = (overrides: Partial<ConversationMutationInput> = {}) =>
        assertConversationMutationAccess(
            {
                conversation,
                requestedXpertId: 'assistant',
                ...overrides
            },
            published,
            projects
        )
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('human-A')
        conversation = {
            id: 'runtime',
            threadId: 'thread',
            from: 'platform',
            xpertId: 'assistant',
            purpose: 'group_assistant_runtime',
            createdById: 'human-A'
        }
        published.getAccessiblePublishedXpertFamilyIds.mockResolvedValue([])
        projects.assertRuntimeAccess.mockResolvedValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())
    it.each([undefined, 'project'])(
        'rejects direct runtime mutation even by its creator (project=%s)',
        async (projectId) => {
            conversation.projectId = projectId
            await expect(check()).rejects.toBeInstanceOf(ForbiddenException)
            await expect(withGroupRuntime('other-runtime', check)).rejects.toBeInstanceOf(ForbiddenException)
            expect(projects.assertRuntimeAccess).not.toHaveBeenCalled()
        }
    )
    it('permits a verified dispatch initiated by a different human', async () => {
        conversation.createdById = 'human-B'
        await expect(withGroupRuntime('runtime', check)).resolves.toBeUndefined()
        await expect(check()).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('does not treat the public group timeline as an execution target', async () => {
        conversation.purpose = 'group'
        await expect(withGroupRuntime('runtime', check)).rejects.toBeInstanceOf(ForbiddenException)
    })
    it('still checks the selected Assistant family inside dispatch', async () => {
        await expect(withGroupRuntime('runtime', () => check({ requestedXpertId: 'other' }))).rejects.toBeInstanceOf(
            BadRequestException
        )
        published.getAccessiblePublishedXpertFamilyIds.mockResolvedValueOnce(['assistant'])
        await expect(
            withGroupRuntime('runtime', () => check({ requestedXpertId: 'published-version' }))
        ).resolves.toBeUndefined()
    })
    it.each(['requestProjectId', 'optionProjectId'] as const)('rejects a changed Project from %s', async (field) => {
        conversation.projectId = 'project'
        await expect(withGroupRuntime('runtime', () => check({ [field]: 'other-project' }))).rejects.toBeInstanceOf(
            BadRequestException
        )
        expect(projects.assertRuntimeAccess).not.toHaveBeenCalled()
    })
    it('preserves Project authorization inside verified dispatch', async () => {
        conversation.projectId = 'project'
        projects.assertRuntimeAccess.mockRejectedValueOnce(new ForbiddenException())
        await expect(withGroupRuntime('runtime', check)).rejects.toBeInstanceOf(ForbiddenException)
        expect(projects.assertRuntimeAccess).toHaveBeenCalledWith('project', 'assistant')
    })
    it('preserves ordinary conversation ownership checks', async () => {
        conversation.purpose = 'private'
        await expect(check()).resolves.toBeUndefined()
        conversation.createdById = 'human-B'
        await expect(withGroupRuntime('runtime', check)).rejects.toBeInstanceOf(ForbiddenException)
    })
})
