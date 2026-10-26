import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { ContentEditorsService } from './content-editors.service'

const input = {
    actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
    projectId: 'project',
    assistantId: 'assistant',
    source: { providerKey: 'library', resourceId: 'item' }
}
function fixture() {
    const descriptor = { key: 'custom.binary', kind: 'file', view: { providerKey: 'custom.view', viewKey: 'editor' } }
    const editor = { descriptor, create: jest.fn().mockResolvedValue(Buffer.from('new')), validateFile: jest.fn() }
    const registry = {
        get: jest.fn().mockReturnValue(editor),
        listRegistrations: jest.fn().mockReturnValue([{ strategy: editor }])
    }
    const files = {
        read: jest.fn().mockResolvedValue({ buffer: Buffer.from('source'), revision: 'r1' }),
        write: jest.fn().mockResolvedValue({ revision: 'r2' })
    }
    const source = {
        describe: jest
            .fn()
            .mockResolvedValue({
                projectId: 'project',
                editorKey: descriptor.key,
                path: 'content.custom',
                title: 'Content'
            }),
        files
    }
    const providers = { get: jest.fn().mockReturnValue({ editor: source }) }
    const resources = { authorize: jest.fn().mockResolvedValue({ canWrite: true }) }
    const access = {
        check: jest.fn().mockResolvedValue({ canWrite: true }),
        denied: () => {
            throw new ForbiddenException()
        }
    }
    const service = new ContentEditorsService(
        registry as never,
        resources as never,
        providers as never,
        access as never,
        { keys: async () => [] } as never
    )
    return { service, editor, registry, files, source, providers, resources, access }
}
describe('format-independent editor routing', () => {
    it('discovers and resolves arbitrary plugin formats without a text state or spreadsheet model', async () => {
        const f = fixture()
        expect(await f.service.list(input)).toEqual([f.editor.descriptor])
        const resolved = await f.service.resolve(input)
        expect(resolved.viewKey).toBe('custom.view__editor')
        expect(f.registry.get).toHaveBeenCalledWith('custom.binary', 'org')
        expect(f.source.describe).toHaveBeenCalledWith({
            actor: input.actor,
            projectId: input.projectId,
            assistantId: input.assistantId,
            sourceResourceId: 'item'
        })
        expect(f.files.read).not.toHaveBeenCalled()
    })
    it('validates prepared bytes without creating a resource or bypassing destination authorization', async () => {
        const f = fixture(),
            buffer = Buffer.from('imported')
        expect((await f.service.prepare({ ...input, editorKey: 'custom.binary', buffer })).buffer).toBe(buffer)
        expect(f.access.check).toHaveBeenCalledWith(expect.anything(), true)
        expect(f.editor.create).not.toHaveBeenCalled()
        expect(f.editor.validateFile).toHaveBeenCalledWith(buffer)
        expect(f.files.write).not.toHaveBeenCalled()
    })
    it('passes opaque bytes and the exact expected revision to the owning resource', async () => {
        const f = fixture(),
            buffer = Buffer.from('next')
        expect((await f.service.read(input)).revision).toBe('r1')
        expect(await f.service.write({ ...input, buffer, expectedRevision: 'r1' })).toEqual({ revision: 'r2' })
        expect(f.files.write).toHaveBeenCalledWith({
            actor: input.actor,
            projectId: 'project',
            assistantId: 'assistant',
            sourceResourceId: 'item',
            buffer,
            expectedRevision: 'r1'
        })
        expect(f.resources.authorize).toHaveBeenLastCalledWith({
            ...input.source,
            actor: input.actor,
            operation: 'write'
        })
    })
    it('rejects cross-project and revoked resource access before any bytes are read', async () => {
        const f = fixture()
        f.source.describe.mockResolvedValue({ projectId: 'another', editorKey: 'custom.binary' })
        await expect(f.service.read(input)).rejects.toBeInstanceOf(ForbiddenException)
        f.resources.authorize.mockRejectedValue(new ForbiddenException())
        await expect(f.service.resolve(input)).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.files.read).not.toHaveBeenCalled()
    })
    it('rejects missing adapters, unsupported sources and text model byte writes', async () => {
        const f = fixture()
        f.registry.get.mockImplementationOnce(() => {
            throw new Error('missing plugin')
        })
        await expect(f.service.resolve(input)).rejects.toThrow('missing plugin')
        f.providers.get.mockReturnValueOnce({})
        await expect(f.service.resolve(input)).rejects.toBeInstanceOf(BadRequestException)
        f.editor.descriptor.kind = 'text-document'
        await expect(
            f.service.write({ ...input, buffer: Buffer.from('raw'), expectedRevision: 'r1' })
        ).rejects.toBeInstanceOf(BadRequestException)
        expect(f.files.write).not.toHaveBeenCalled()
    })
    it('rejects read-only source permissions even when the project is writable', async () => {
        const f = fixture()
        f.resources.authorize.mockResolvedValue({ canWrite: false })
        expect((await f.service.resolve(input)).canWrite).toBe(false)
        await expect(
            f.service.write({ ...input, buffer: Buffer.from('raw'), expectedRevision: 'r1' })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(f.files.write).not.toHaveBeenCalled()
    })
})
