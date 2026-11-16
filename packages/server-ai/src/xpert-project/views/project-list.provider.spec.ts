import { Test } from '@nestjs/testing'
import { ForbiddenException } from '@nestjs/common'
import { AGENT_WORKBENCH_SLOT, SecretTokenBindingType, type XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { ProjectListViewProvider } from './project-list.provider'
import { XpertProjectService } from '../project.service'
import { XpertProjectFeatureGuard } from '../guards/project-feature.guard'
import { RequestContext } from '@xpert-ai/plugin-sdk'

jest.mock('../project.service', () => ({ XpertProjectService: class {} }))
jest.mock('../guards/project-feature.guard', () => ({ XpertProjectFeatureGuard: class {} }))
jest.mock('@xpert-ai/plugin-sdk', () => ({
    ViewExtensionProvider: () => () => undefined,
    RequestContext: {
        currentApiPrincipal: jest.fn(), currentTenantId: () => 'tenant', currentUserId: () => 'user',
        getOrganizationId: () => 'org', hasPermissions: jest.fn()
    }
}))

describe('Project list View discovery and authorization', () => {
    const host: XpertResolvedViewHostContext = { hostType: 'agent', hostId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'user', slots: [] }
    const list = jest.fn(), feature = jest.fn()
    let view: ProjectListViewProvider
    beforeEach(async () => {
        jest.resetAllMocks()
        jest.mocked(RequestContext.hasPermissions).mockReturnValue(true)
        const module = await Test.createTestingModule({ providers: [
            ProjectListViewProvider,
            { provide: XpertProjectService, useValue: { listAssistantProjects: list } },
            { provide: XpertProjectFeatureGuard, useValue: { canActivate: feature } }
        ] }).compile()
        view = module.get(ProjectListViewProvider)
    })
    it('opens without a selected project and resolves the Assistant from the trusted host', async () => {
        expect(view.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toMatchObject([{ key: 'list', activation: { requiredFeatures: ['project.tasks'] } }])
        list.mockResolvedValue({ items: [], total: 0, types: [], assistantName: 'Delivery' })
        await view.getViewData(host, 'list', { page: 2, pageSize: 5, parameters: { manageableOnly: true } })
        expect(list).toHaveBeenCalledWith({ xpertId: 'assistant', status: 'all', manageableOnly: true, take: 5, skip: 5, filter: {} })
        expect(feature).toHaveBeenCalledTimes(1)
    })
    it('denies mismatched organization, missing permission and disabled feature before querying project rows', async () => {
        await expect(view.getViewData({ ...host, organizationId: 'other' }, 'list', {})).rejects.toThrow(ForbiddenException)
        jest.mocked(RequestContext.hasPermissions).mockReturnValueOnce(false)
        expect(view.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toEqual([])
        feature.mockRejectedValueOnce(new ForbiddenException())
        await expect(view.getViewData(host, 'list', {})).rejects.toThrow(ForbiddenException)
        expect(list).not.toHaveBeenCalled()
    })
    it('excludes non-interactive Assistant secrets', () => {
        jest.spyOn(RequestContext, 'currentApiPrincipal').mockReturnValue({
            principalType: 'client_secret', clientSecretBindingType: SecretTokenBindingType.ENTERPRISE_XPERT
        } as ReturnType<typeof RequestContext.currentApiPrincipal>)
        expect(view.getViewManifests(host, AGENT_WORKBENCH_SLOT)).toEqual([])
    })
})
