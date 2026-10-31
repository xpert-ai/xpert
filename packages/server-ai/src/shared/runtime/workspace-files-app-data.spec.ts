import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'

describe('WorkspaceFiles.appData binding', () => {
    afterEach(() => jest.restoreAllMocks())
    it('requires an explicit authenticated Project or Assistant binding', () => {
        const service = new WorkspaceFilesRuntimeCapabilityService(
            { execute: jest.fn() },
            { resolve: jest.fn() },
            { listReadable: jest.fn(), assertAssistant: jest.fn(), assertEdit: jest.fn() },
            { execute: jest.fn() }
        )
        const options = { pluginName: 'meetings' }
        expect(() => service.appData(options)).toThrow(BadRequestException)
        expect(() => service.createScopedApi({ projectId: 'project', xpertId: 'assistant' }).appData(options)).toThrow(
            ForbiddenException
        )
        expect(() =>
            service.createScopedApi({ catalog: 'users', userId: 'alice', scopeId: 'alice' }).appData(options)
        ).toThrow(BadRequestException)
    })
    it('reauthorizes explicit Project storage before reaching the filesystem', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('alice')
        const resolve = jest.fn(),
            listReadable = jest.fn().mockResolvedValue([]),
            assertEdit = jest.fn().mockRejectedValue(new ForbiddenException())
        const service = new WorkspaceFilesRuntimeCapabilityService(
            { execute: jest.fn() },
            { resolve },
            { listReadable, assertEdit, assertAssistant: jest.fn() },
            { execute: jest.fn() }
        )
        const app = service.appData({ pluginName: 'dashboards', projectId: 'project' })
        await expect(app.read('delivery.json')).rejects.toThrow(ForbiddenException)
        await expect(app.write('delivery.json', '{}')).rejects.toThrow(ForbiddenException)
        expect(listReadable).toHaveBeenCalledWith({
            actor: { tenantId: 'tenant', organizationId: 'org', userId: 'alice' },
            projectIds: ['project']
        })
        expect(resolve).not.toHaveBeenCalled()
    })
    it('captures immutable actor and plugin options and denies an actor change before storage or metadata access', async () => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        const actor = jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('alice')
        const resolve = jest.fn()
        const execute = jest.fn()
        const service = new WorkspaceFilesRuntimeCapabilityService(
            { execute },
            { resolve },
            { listReadable: jest.fn(), assertAssistant: jest.fn(), assertEdit: jest.fn() },
            { execute: jest.fn() }
        )
        const scope = { tenantId: 'tenant', organizationId: 'org', userId: 'alice', xpertId: 'assistant' }
        const scoped = service.createScopedApi(scope)
        const app = scoped.appData({ pluginName: 'meetings' })
        scope.userId = 'bob'
        actor.mockReturnValue('bob')
        await expect(app.read('secret')).rejects.toThrow(ForbiddenException)
        expect(resolve).not.toHaveBeenCalled()
        expect(execute).not.toHaveBeenCalled()
    })
})
