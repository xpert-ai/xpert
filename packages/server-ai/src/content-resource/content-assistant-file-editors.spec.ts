import { ConflictException, ForbiddenException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { VolumeHandle, resolveXpertDataVolumeScope } from '../shared/volume/volume'
import { resolveWorkspaceVolumeScope } from '../file-understanding/domain/workspace-file'
import { readWorkspaceFile } from '../shared/volume/workspace-file-io'
import { ContentFileEditors } from './content-file-editors.service'

describe('Assistant workspace editor authority', () => {
    let root: string, volume: VolumeHandle
    const input = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        assistantId: 'assistant',
        path: 'data.csv'
    }
    beforeEach(async () => {
        root = await mkdtemp(join(tmpdir(), 'assistant-file-editor-'))
        volume = new VolumeHandle(
            resolveXpertDataVolumeScope({
                tenantId: 'tenant',
                xpertId: 'assistant',
                userId: 'user',
                workspaceDataScope: 'user'
            }),
            root,
            root,
            ''
        )
        await volume.writeFile(input.path, Buffer.from('amount\n10'))
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user')
    })
    afterEach(async () => {
        jest.restoreAllMocks()
        await rm(root, { recursive: true, force: true })
    })
    function fixture() {
        const execute = jest.fn(async () => ({ scope: volume.scope, capabilities: { canWrite: true } }))
        const principal = jest.fn()
        const codec = {
            descriptor: {
                kind: 'file',
                key: 'office.csv',
                extension: 'csv',
                view: { providerKey: 'office.files', viewKey: 'office.file' }
            },
            validateFile: jest.fn()
        }
        const api = new ContentFileEditors(
            {
                check: jest.fn(() => {
                    throw new Error('Project authority was used')
                })
            } as never,
            { listRegistrations: () => [{ strategy: codec }] } as never,
            {} as never,
            {} as never,
            {} as never,
            { identities: { principal } } as never,
            { execute } as never,
            { resolve: () => volume } as never
        )
        return { api, execute, principal }
    }
    it('uses published Assistant authority and retains CAS on the existing file', async () => {
        const { api, execute } = fixture()
        const opened = await api.read(input)
        expect(opened.file.assistantId).toBe('assistant')
        expect(opened.file.projectId).toBeUndefined()
        expect(opened.reference).toMatchObject({
            catalog: 'user-xperts',
            xpertId: 'assistant',
            userId: 'user',
            filePath: input.path
        })
        expect(execute).toHaveBeenCalledWith(
            expect.objectContaining({ assistantId: 'assistant', entry: 'runtime', operation: 'read' })
        )
        const saved = await api.write({
            ...input,
            buffer: Buffer.from('amount\n20'),
            expectedRevision: opened.revision
        })
        expect(saved.revision).not.toBe(opened.revision)
        await expect(
            api.write({ ...input, buffer: Buffer.from('amount\n30'), expectedRevision: opened.revision })
        ).rejects.toBeInstanceOf(ConflictException)
        expect((await readWorkspaceFile(volume, input.path)).buffer.toString()).toBe('amount\n20')
    })
    it.each(['user', 'shared'] as const)(
        'keeps %s download references in the same authorized volume',
        async (workspaceDataScope) => {
            const scope = resolveXpertDataVolumeScope({
                tenantId: 'tenant',
                xpertId: 'assistant',
                userId: 'user',
                workspaceDataScope
            })
            volume = new VolumeHandle(scope, root, root, '')
            const { api } = fixture()
            const opened = await api.read(input)
            const resolved = resolveWorkspaceVolumeScope(opened.reference)
            expect(resolved?.volumeScope).toMatchObject(scope)
            expect(resolved?.volumeScope.catalog).toBe(workspaceDataScope === 'user' ? 'user-xperts' : 'xperts')
        }
    )
    it('rejects impersonation and revoked access before reading or publishing', async () => {
        const { api, execute } = fixture()
        await expect(api.read({ ...input, actor: { ...input.actor, userId: 'other' } })).rejects.toBeInstanceOf(
            ForbiddenException
        )
        expect(execute).not.toHaveBeenCalled()
        const opened = await api.read(input)
        execute.mockRejectedValue(new ForbiddenException())
        await expect(
            api.write({ ...input, buffer: Buffer.from('changed'), expectedRevision: opened.revision })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect((await readWorkspaceFile(volume, input.path)).buffer.toString()).toBe('amount\n10')
    })
})
