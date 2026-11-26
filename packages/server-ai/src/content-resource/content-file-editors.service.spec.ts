import { ConflictException, ForbiddenException } from '@nestjs/common'
import { ContentFileEditors } from './content-file-editors.service'

const scope = {
    actor: { tenantId: 't', organizationId: 'o', userId: 'u' },
    projectId: 'p',
    assistantId: 'a',
    path: 'docs/deck.pptx'
}
function setup() {
    const access = { check: jest.fn(async () => ({ canWrite: true })) }
    const codec = {
        descriptor: { kind: 'file', key: 'pptx', extension: '.pptx', view: { providerKey: 'pptx', viewKey: 'editor' } },
        validateFile: jest.fn()
    }
    const ownership = { findFileResource: jest.fn(async () => null), assertUnmanaged: jest.fn() }
    const files = {
        read: jest.fn(async () => ({ buffer: Buffer.from('pptx'), sha256: 'original' })),
        writeUnmanaged: jest.fn(async () => ({ sha256: 'new' }))
    }
    const resolveFile = jest.fn<Promise<string | null>, [unknown]>(async () => null)
    const resources = { catalog: { register: jest.fn() } }
    const providers = { listRegistrations: jest.fn(() => [{ type: 'spaces', strategy: { catalog: { resolveFile } } }]) }
    return {
        access,
        codec,
        ownership,
        files,
        resolveFile,
        resources,
        providers,
        api: new ContentFileEditors(
            access as never,
            { listRegistrations: () => [{ strategy: codec }] } as never,
            ownership as never,
            files as never,
            providers as never,
            resources as never,
            {} as never,
            {} as never
        )
    }
}
describe('Project file editor boundary', () => {
    it('routes newly imported provider files before their catalog projection exists', async () => {
        const f = setup()
        f.resolveFile.mockResolvedValue('new-space-file')
        const source = { providerKey: 'spaces', resourceId: 'new-space-file' }
        expect(await f.api.owner(scope)).toEqual(source)
        expect(f.providers.listRegistrations).toHaveBeenCalledWith(scope.actor.organizationId)
        expect(f.resolveFile).toHaveBeenCalledWith(scope)
        expect(f.resources.catalog.register).toHaveBeenCalledWith({ ...scope, source })
        await expect(
            f.api.write({ ...scope, buffer: Buffer.from('next'), expectedRevision: 'old' })
        ).rejects.toBeInstanceOf(ConflictException)
        expect(f.files.writeUnmanaged).not.toHaveBeenCalled()
    })
    it('does not fall back to unmanaged files when live owner authorization fails', async () => {
        const f = setup()
        f.resolveFile.mockRejectedValue(new ForbiddenException())
        await expect(f.api.read(scope)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.files.read).not.toHaveBeenCalled()
    })
    it('keeps the path and stable tab identity while reauthorizing every read', async () => {
        const f = setup(),
            first = await f.api.read(scope),
            second = await f.api.read(scope)
        expect(first.selectionId).toBe(second.selectionId)
        expect(first.parameters.filePath).toBe(scope.path)
        expect(first.file.path).toBe(scope.path)
        expect(f.access.check).toHaveBeenCalledTimes(4)
        expect(f.codec.validateFile).toHaveBeenCalledWith(Buffer.from('pptx'))
    })
    it('blocks an owner-managed path before reading or writing bytes', async () => {
        const f = setup()
        f.ownership.assertUnmanaged.mockRejectedValue(new ConflictException())
        await expect(f.api.read(scope)).rejects.toBeInstanceOf(ConflictException)
        await expect(
            f.api.write({ ...scope, buffer: Buffer.from('next'), expectedRevision: 'old' })
        ).rejects.toBeInstanceOf(ConflictException)
        expect(f.files.read).not.toHaveBeenCalled()
        expect(f.files.writeUnmanaged).not.toHaveBeenCalled()
    })
    it('rejects revoked Assistant/Project access and invalid paths before file access', async () => {
        const f = setup()
        f.access.check.mockRejectedValueOnce(new ForbiddenException())
        await expect(f.api.owner(scope)).rejects.toBeInstanceOf(ForbiddenException)
        await expect(f.api.read({ ...scope, path: '../secret.pptx' })).rejects.toThrow()
        expect(f.files.read).not.toHaveBeenCalled()
    })
    it('passes exact baseline to the atomic unmanaged writer and preserves conflict errors', async () => {
        const f = setup(),
            input = { ...scope, buffer: Buffer.from('next'), expectedRevision: 'old' }
        expect(await f.api.write(input)).toEqual({ revision: 'new' })
        expect(f.files.writeUnmanaged).toHaveBeenCalledWith(
            expect.objectContaining({ expectedHash: 'old', path: scope.path })
        )
        f.files.writeUnmanaged.mockRejectedValue(new ConflictException())
        await expect(f.api.write(input)).rejects.toBeInstanceOf(ConflictException)
    })
})
