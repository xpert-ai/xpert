import { AIPermissionsEnum } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { appPlatformKnowledgeIds } from './app-platform-knowledge-access'

describe('application knowledge access scope', () => {
    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
    })
    afterEach(() => jest.restoreAllMocks())

    it('keeps ordinary tenant-scoped accounts on the existing authorization path', async () => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        const query = jest.fn().mockResolvedValue([{ enrolled: false }])
        await expect(appPlatformKnowledgeIds({ query } as never)).resolves.toBeNull()
        expect(query).toHaveBeenCalledTimes(1)
    })

    it('does not grant managed library access before an organization is selected', async () => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        const query = jest.fn().mockResolvedValue([{ enrolled: true }])
        await expect(appPlatformKnowledgeIds({ query } as never)).resolves.toEqual([])
        expect(query).toHaveBeenCalledTimes(1)
    })

    it('leaves unauthenticated requests to the existing authorization boundary', async () => {
        jest.mocked(RequestContext.currentUserId).mockReturnValue(undefined)
        const query = jest.fn()
        await expect(appPlatformKnowledgeIds({ query } as never)).resolves.toBeNull()
        expect(query).not.toHaveBeenCalled()
    })

    it('queries assigned libraries with the authenticated account, organization, workspace and runtime permission', async () => {
        const id = '11111111-1111-4111-8111-111111111111'
        const query = jest
            .fn()
            .mockResolvedValueOnce([{ enrolled: true }])
            .mockResolvedValueOnce([{ id }])
        await expect(appPlatformKnowledgeIds({ query } as never, 'workspace')).resolves.toEqual([id])
        expect(query.mock.calls[1][1]).toEqual(['tenant', 'org', 'user', 'workspace', AIPermissionsEnum.CHAT_VIEW])
    })
})
