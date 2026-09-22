import { ForbiddenException } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { RequestContext } from '@xpert-ai/server-core'
import { XpertGuard } from './xpert.guard'
import { XpertService } from '../xpert.service'
import { XpertWorkspaceService } from '../../xpert-workspace/workspace.service'

describe('XpertGuard', () => {
    const USER_ID = 'user-1'

    function createGuard(xpert: Record<string, unknown> | null, canAccess = false) {
        const cacheManager = {
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined)
        }
        const xpertService = {
            findOneByIdOrSlug: jest.fn().mockResolvedValue(xpert)
        } as unknown as XpertService
        const workspaceService = {
            canAccess: jest.fn().mockResolvedValue(canAccess)
        } as unknown as XpertWorkspaceService

        const guard = new XpertGuard(
            cacheManager as never,
            { get: jest.fn() } as never,
            xpertService,
            workspaceService
        )

        return { guard, cacheManager, xpertService, workspaceService }
    }

    function createContext(id: string) {
        return {
            switchToHttp: () => ({
                getRequest: () => ({ params: { id }, user: { id: USER_ID } })
            })
        } as never
    }

    beforeEach(() => {
        jest.restoreAllMocks()
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
    })

    it('allows the author of an assistant addressed by slug', async () => {
        const { guard, xpertService, workspaceService } = createGuard({
            id: 'xpert-1',
            createdById: USER_ID,
            workspaceId: 'workspace-1'
        })

        await expect(guard.canActivate(createContext('scrape-task-intake-assistant'))).resolves.toBe(true)
        // The slug must be resolved by the service, not passed straight through as an id.
        expect(xpertService.findOneByIdOrSlug).toHaveBeenCalledWith('scrape-task-intake-assistant')
        expect(workspaceService.canAccess).not.toHaveBeenCalled()
    })

    it('falls back to workspace access for assistants the user does not own', async () => {
        const { guard, workspaceService } = createGuard(
            { id: 'xpert-1', createdById: 'someone-else', workspaceId: 'workspace-1' },
            true
        )

        await expect(guard.canActivate(createContext('xpert-1'))).resolves.toBe(true)
        expect(workspaceService.canAccess).toHaveBeenCalledWith('workspace-1', USER_ID)
    })

    it('denies access when the workspace is not reachable', async () => {
        const { guard, cacheManager } = createGuard(
            { id: 'xpert-1', createdById: 'someone-else', workspaceId: 'workspace-1' },
            false
        )

        await expect(guard.canActivate(createContext('xpert-1'))).rejects.toThrow(ForbiddenException)
        expect(cacheManager.set).not.toHaveBeenCalled()
    })
})
