jest.mock('i18next', () => ({ t: (key: string) => key }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    RequestContext: { currentTenantId: () => 'tenant', getOrganizationId: jest.fn(() => 'org') }
}))
jest.mock('../xpert.entity', () => ({ Xpert: class {} }))
jest.mock('../published-xpert-access.service', () => ({ PublishedXpertAccessService: class {} }))
jest.mock('../../xpert-workspace/workspace-access.service', () => ({ XpertWorkspaceAccessService: class {} }))
import { ForbiddenException, ConflictException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { AssistantAppearanceService } from './assistant-appearance.service'

function fixture() {
    const assistant = {
        id: 'assistant',
        title: 'Before',
        titleCN: 'Before',
        avatar: {},
        tenantId: 'tenant',
        organizationId: 'org',
        workspaceId: 'workspace',
        draft: { nodes: ['keep'] }
    }
    const access = { assertCanAuthor: jest.fn(async () => undefined) }
    const repo = { findOne: jest.fn(async () => assistant), update: jest.fn() }
    const published = { getAccessiblePublishedXpert: jest.fn(async () => assistant) }
    const service = new AssistantAppearanceService(
        published as never,
        access as never,
        { transaction: async (callback) => callback({ getRepository: () => repo }) } as never
    )
    return { service, assistant, access, repo }
}
describe('Public Assistant appearance', () => {
    beforeEach(() => {
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue('org')
    })
    it('shows accessible tenant-shared avatars read-only in organization scope', async () => {
        const f = fixture()
        f.assistant.organizationId = null
        const current = await f.service.get('assistant')
        expect(current.canEdit).toBe(false)
        await expect(
            f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('allows reading without author access but rejects saving', async () => {
        const f = fixture()
        f.access.assertCanAuthor.mockRejectedValue(new ForbiddenException())
        const current = await f.service.get('assistant')
        expect(current.canEdit).toBe(false)
        await expect(
            f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('updates identity fields only, leaving the draft and workflow intact', async () => {
        const f = fixture()
        const current = await f.service.get('assistant')
        await f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        expect(f.repo.findOne).toHaveBeenCalledWith(
            expect.objectContaining({ loadEagerRelations: false, lock: { mode: 'pessimistic_write' } })
        )
        expect(f.repo.update).toHaveBeenCalledWith('assistant', { title: 'After', titleCN: 'After', avatar: {} })
        expect(f.assistant.draft).toEqual({ nodes: ['keep'] })
    })
    it('rejects another organization and a concurrent identity edit', async () => {
        const f = fixture()
        const current = await f.service.get('assistant')
        f.assistant.title = 'Changed elsewhere'
        await expect(
            f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ConflictException)
        f.assistant.organizationId = 'other'
        await expect(f.service.get('assistant')).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('keeps tenant-shared avatars read-only without organization context', async () => {
        const f = fixture()
        f.assistant.organizationId = null
        jest.mocked(RequestContext.getOrganizationId).mockReturnValue(null)
        const current = await f.service.get('assistant')
        expect(current.canEdit).toBe(false)
        expect(f.access.assertCanAuthor).not.toHaveBeenCalled()
        await expect(
            f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('rejects an assistant from another tenant', async () => {
        const f = fixture()
        f.assistant.tenantId = 'other'
        await expect(f.service.get('assistant')).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            f.service.save('assistant', { revision: 'a'.repeat(64), name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.access.assertCanAuthor).not.toHaveBeenCalled()
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('rejects a workspace change between authorization and the locked update', async () => {
        const f = fixture()
        const current = await f.service.get('assistant')
        f.repo.findOne.mockResolvedValueOnce({ ...f.assistant, workspaceId: 'other-workspace' })
        await expect(
            f.service.save('assistant', { revision: current.revision, name: 'After', avatar: {} })
        ).rejects.toBeInstanceOf(ConflictException)
        expect(f.repo.update).not.toHaveBeenCalled()
    })
    it('does not hide an authorization infrastructure error as read-only access', async () => {
        const f = fixture()
        const error = new Error('database unavailable')
        f.access.assertCanAuthor.mockRejectedValue(error)
        await expect(f.service.get('assistant')).rejects.toBe(error)
    })
})
