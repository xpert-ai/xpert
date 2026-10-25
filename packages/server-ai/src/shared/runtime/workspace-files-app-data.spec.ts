import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'

describe('WorkspaceFiles.appData binding', () => {
    afterEach(() => jest.restoreAllMocks())
    it('requires an Assistant binding and cannot silently select a Project or unscoped directory', () => {
        const service = new WorkspaceFilesRuntimeCapabilityService(
            { execute: jest.fn() },
            { resolve: jest.fn() },
            { listReadable: jest.fn(), assertEdit: jest.fn() },
            { execute: jest.fn() }
        )
        const options = { pluginName: 'meetings' }
        expect(() => service.appData(options)).toThrow(BadRequestException)
        expect(() => service.createScopedApi({ projectId: 'project', xpertId: 'assistant' }).appData(options)).toThrow(
            BadRequestException
        )
        expect(() =>
            service.createScopedApi({ catalog: 'users', userId: 'alice', scopeId: 'alice' }).appData(options)
        ).toThrow(BadRequestException)
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
            { listReadable: jest.fn(), assertEdit: jest.fn() },
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
