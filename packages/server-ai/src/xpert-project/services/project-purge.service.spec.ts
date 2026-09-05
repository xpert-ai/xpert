import { ForbiddenException, NotFoundException } from '@nestjs/common'
jest.mock('../project.service', () => ({ XpertProjectService: class {} }))
jest.mock('./project-access.service', () => ({ XpertProjectAccessService: class {} }))
jest.mock('../../file-understanding/file-asset-deletion.service', () => ({ FileAssetDeletionService: class {} }))
jest.mock('../../shared/volume', () => ({
    VOLUME_CLIENT: 'volume',
    VolumeClient: class {},
    VolumeHandle: { removePath: jest.fn(async () => undefined) }
}))
import { VolumeHandle } from '../../shared/volume'
import { XpertProjectPurgeService } from './project-purge.service'
function fixture() {
    const project = { id: 'p', tenantId: 't', ownerId: 'u', status: 'archived' }
    const access = { assertCanPurge: jest.fn(async () => ({ project, role: 'owner' })) }
    const projects = {
        findOne: jest.fn(async () => ({ xperts: [{ id: 'a' }] })),
        deleteProject: jest.fn(async () => ({}))
    }
    const files = { find: jest.fn(async () => [{ id: 'file', status: 'ready' }]) }
    const authority = { purgeProjectFile: jest.fn() }
    const volumes = {
        resolve: jest.fn(() => ({ serverRoot: '/tenant/projects/p' })),
        resolveRoot: jest.fn(() => ({ serverRoot: '/tenant' }))
    }
    const service = new XpertProjectPurgeService(
        access as never,
        projects as never,
        { get: () => authority } as never,
        files as never,
        volumes as never
    )
    return { service, project, access, projects, files, authority }
}
describe('plugin-owned Project purge', () => {
    beforeEach(() => jest.clearAllMocks())
    it('rejects non-owners, active projects and wrong Assistant bindings before removing data', async () => {
        const f = fixture()
        f.access.assertCanPurge.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.service.purge({ projectId: 'p', xpertId: 'a' })).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.service.purge({ projectId: 'p', xpertId: 'other' })).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.authority.purgeProjectFile).not.toHaveBeenCalled()
        expect(VolumeHandle.removePath).not.toHaveBeenCalled()
    })
    it('propagates file cleanup failures before deleting the project', async () => {
        const f = fixture()
        f.authority.purgeProjectFile.mockRejectedValue(new ForbiddenException())
        await expect(f.service.purge({ projectId: 'p', xpertId: 'a' })).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.projects.deleteProject).not.toHaveBeenCalled()
    })
    it('removes understood assets and only the tenant-bounded project volume before deleting the Project', async () => {
        const f = fixture()
        expect(await f.service.purge({ projectId: 'p', xpertId: 'a' })).toEqual({ projectId: 'p', deleted: true })
        expect(f.files.find).toHaveBeenCalledWith({ where: { tenantId: 't', projectId: 'p' } })
        expect(f.authority.purgeProjectFile).toHaveBeenCalledWith('file', 'p')
        expect(f.authority.purgeProjectFile).toHaveBeenCalledTimes(1)
        expect(VolumeHandle.removePath).toHaveBeenCalledWith('/tenant/projects', 'p', { boundaryRoot: '/tenant' })
        expect(f.projects.deleteProject).toHaveBeenCalledWith('p')
    })
    it('makes a cleanup retry safe after the Project has already been removed', async () => {
        const f = fixture()
        f.access.assertCanPurge.mockRejectedValue(new NotFoundException())
        expect(await f.service.purge({ projectId: 'p', xpertId: 'a' })).toMatchObject({ deleted: true })
        expect(VolumeHandle.removePath).not.toHaveBeenCalled()
    })
})
