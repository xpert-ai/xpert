import { RequestContext } from '@xpert-ai/plugin-sdk'
import { In, IsNull } from 'typeorm'
import { XpertProjectAccessService } from './project-access.service'

describe('fresh Project catalog authority', () => {
    function fixture() {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
        const projects = { find: jest.fn() }
        const memberships = { find: jest.fn() }
        const principals = { isPrincipal: jest.fn().mockResolvedValue(false), find: jest.fn() }
        const service = new XpertProjectAccessService(projects as never, memberships as never, {} as never, principals)
        return { service, projects, memberships, principals }
    }
    afterEach(() => jest.restoreAllMocks())

    it('reads current ownership and membership in one scoped batch and observes revocation on the next call', async () => {
        const f = fixture()
        f.projects.find.mockResolvedValue([
            { id: 'owned', ownerId: 'user' },
            { id: 'shared', ownerId: 'other' }
        ])
        f.memberships.find.mockResolvedValueOnce([{ projectId: 'shared', role: 'member' }]).mockResolvedValueOnce([])
        expect(
            (await f.service.readableProjects(['owned', 'shared', 'absent'])).map(({ project, role }) => [
                project.id,
                role
            ])
        ).toEqual([
            ['owned', 'owner'],
            ['shared', 'member']
        ])
        expect((await f.service.readableProjects(['owned', 'shared'])).map(({ project }) => project.id)).toEqual([
            'owned'
        ])
        expect(f.projects.find).toHaveBeenNthCalledWith(1, {
            where: {
                id: In(['owned', 'shared', 'absent']),
                tenantId: 'tenant',
                organizationId: 'org'
            }
        })
        expect(f.memberships.find).toHaveBeenCalledWith({
            where: {
                projectId: In(['shared']),
                userId: 'user',
                tenantId: 'tenant',
                organizationId: 'org'
            }
        })
        expect(f.principals.isPrincipal).toHaveBeenCalledTimes(2)
    })
    it('never lets an Assistant principal fall back to ordinary ownership or membership', async () => {
        const f = fixture()
        f.principals.isPrincipal.mockResolvedValue(true)
        f.projects.find.mockResolvedValue([
            { id: 'owned', ownerId: 'user' },
            { id: 'bound', ownerId: 'other' }
        ])
        f.principals.find.mockResolvedValueOnce(null).mockResolvedValueOnce({ assistant: { id: 'assistant' } })
        expect(
            (await f.service.readableProjects(['owned', 'bound'])).map(({ project, role }) => [project.id, role])
        ).toEqual([['bound', 'assistant']])
        expect(f.memberships.find).not.toHaveBeenCalled()
        expect(f.principals.find).toHaveBeenCalledWith(
            { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
            { projectId: 'owned' }
        )
    })
    it('retains null organization scope and fails closed on an incomplete membership read', async () => {
        const f = fixture()
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(undefined)
        f.projects.find.mockResolvedValue([{ id: 'shared', ownerId: 'other' }])
        f.memberships.find.mockRejectedValueOnce(new Error('database unavailable'))
        await expect(f.service.readableProjects(['shared'])).rejects.toThrow('database unavailable')
        expect(f.projects.find).toHaveBeenCalledWith({
            where: {
                id: In(['shared']),
                tenantId: 'tenant',
                organizationId: IsNull()
            }
        })
    })
    it('bounds query size and does not issue an unrestricted query for an empty catalog', async () => {
        const f = fixture()
        f.projects.find.mockResolvedValue([])
        await expect(f.service.readableProjects([])).resolves.toEqual([])
        expect(f.projects.find).not.toHaveBeenCalled()
        await f.service.readableProjects(Array.from({ length: 205 }, (_, index) => `p-${index}`))
        expect(f.projects.find).toHaveBeenCalledTimes(3)
        expect(f.principals.isPrincipal).toHaveBeenCalledTimes(1)
    })
})
