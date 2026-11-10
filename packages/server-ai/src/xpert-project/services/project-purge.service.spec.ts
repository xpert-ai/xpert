import { DeleteFileAssetHandler } from '../../file-understanding/commands/handlers/delete-file-asset.handler'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { EntityManager } from 'typeorm'
import { XpertProjectPurgeService } from './project-purge.service'
import { VolumeHandle } from '../../shared/volume'
import { deleteProjectRecord } from './purge/delete-project-record'

jest.mock('./purge/project-purge-receipt', () => ({
    ...jest.requireActual('./purge/project-purge-receipt'),
    admitProjectPurge: (manager: EntityManager, _scope: unknown, authorize: (tx: EntityManager) => Promise<void>) =>
        authorize(manager),
    finishProjectPurge: async (
        manager: EntityManager,
        _scope: unknown,
        cleanup: () => Promise<void>,
        finish: (tx: EntityManager) => Promise<void>
    ) => {
        await cleanup()
        await finish(manager)
    }
}))
jest.mock('./purge/delete-project-record', () => ({ deleteProjectRecord: jest.fn() }))
jest.mock('../../shared/volume', () => ({
    VOLUME_CLIENT: 'volume',
    VolumeHandle: { removePath: jest.fn(async () => undefined) }
}))

function fixture() {
    const project = { id: 'p', tenantId: 't', ownerId: 'u', status: 'archived' }
    const projects = { findOne: jest.fn(async () => project), exists: jest.fn(async () => true) }
    const access = { assertCanPurge: jest.fn() }
    const types = { assertProvisionedPurge: jest.fn() }
    const files = {
        manager: { getRepository: () => projects },
        find: jest.fn(async () => [{ id: 'file', status: 'ready' }])
    }
    const authority = { purgeProjectFile: jest.fn() }
    const volumes = {
        resolve: () => ({
            serverRoot: '/tenant/projects/p',
            withRemovalBudget: (commit: () => Promise<void>) => commit()
        }),
        resolveRoot: () => ({ serverRoot: '/tenant' })
    }
    const service = new XpertProjectPurgeService(
        access as never,
        types as never,
        {} as never,
        new DeleteFileAssetHandler(authority as never) as never,
        files as never,
        volumes as never
    )
    return { service, project, projects, access, types, files, authority }
}

describe('plugin-owned Project purge', () => {
    const input = { projectId: 'p', xpertId: 'a' }
    beforeEach(() => {
        jest.clearAllMocks()
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'u', tenantId: 't' })
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue(null)
        jest.mocked(deleteProjectRecord).mockResolvedValue({ affected: 1, raw: [] })
    })
    afterEach(() => jest.restoreAllMocks())
    it.each(['owner', 'assistant', 'provider', 'busy'])(
        'fails %s admission before touching files',
        async (condition) => {
            const f = fixture()
            if (condition === 'owner') f.access.assertCanPurge.mockRejectedValue(new ForbiddenException())
            if (condition === 'assistant') f.projects.exists.mockResolvedValue(false)
            if (condition === 'provider') f.types.assertProvisionedPurge.mockRejectedValue(new ForbiddenException())
            if (condition === 'busy') f.files.find.mockResolvedValue([{ id: 'file', status: 'parsing' }])
            await expect(f.service.purge(input)).rejects.toBeInstanceOf(
                condition === 'busy' ? BadRequestException : ForbiddenException
            )
            expect(f.authority.purgeProjectFile).not.toHaveBeenCalled()
            expect(VolumeHandle.removePath).not.toHaveBeenCalled()
        }
    )
    it('keeps the Project record on file cleanup failure', async () => {
        const f = fixture()
        f.authority.purgeProjectFile.mockRejectedValue(new Error('file cleanup failed'))
        await expect(f.service.purge(input)).rejects.toThrow('file cleanup failed')
        expect(deleteProjectRecord).not.toHaveBeenCalled()
    })
    it('checks the business binding once before removing tenant-scoped files and workspace', async () => {
        const f = fixture()
        await expect(f.service.purge(input)).resolves.toEqual({ projectId: 'p', deleted: true })
        expect(f.types.assertProvisionedPurge).toHaveBeenCalledWith(f.project, 'a')
        expect(f.types.assertProvisionedPurge).toHaveBeenCalledTimes(1)
        expect(f.authority.purgeProjectFile).toHaveBeenCalledWith('file', 'p')
        expect(VolumeHandle.removePath).toHaveBeenCalledWith('/tenant/projects', 'p', { boundaryRoot: '/tenant' })
        expect(deleteProjectRecord).toHaveBeenCalledWith(
            f.files.manager,
            {},
            { id: 'p', tenantId: 't', organizationId: null }
        )
    })
})
