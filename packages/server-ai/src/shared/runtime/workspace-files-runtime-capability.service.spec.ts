import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { VolumeHandle } from '../volume'
import { WorkspaceFilesRuntimeCapabilityService } from './workspace-files-runtime-capability.service'

describe('WorkspaceFilesRuntimeCapabilityService read-only sources', () => {
    const roots: string[] = []

    afterEach(async () => {
        await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
    })

    it('maps one scoped regular file to equivalent API and Provider paths', async () => {
        const serverRoot = await temporaryRoot()
        const hostRoot = '/host/xpert/tenant-1/project/project-1'
        const filePath = 'media/source.mov'
        await mkdir(path.join(serverRoot, 'media'), { recursive: true })
        await writeFile(path.join(serverRoot, filePath), Buffer.from('seekable-media'))
        const service = createService(serverRoot, hostRoot)

        await expect(service.resolveReadOnlyFileSource(reference(filePath))).resolves.toMatchObject({
            serverPath: await realpath(path.join(serverRoot, filePath)),
            hostPath: path.join(hostRoot, filePath),
            size: 14
        })
    })

    it('rejects a Workspace symlink that escapes the scoped Volume', async () => {
        const serverRoot = await temporaryRoot()
        const outsideRoot = await temporaryRoot()
        const outsidePath = path.join(outsideRoot, 'outside.mov')
        await writeFile(outsidePath, Buffer.from('outside'))
        await symlink(outsidePath, path.join(serverRoot, 'escape.mov'))
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveReadOnlyFileSource(reference('escape.mov'))).rejects.toThrow(
            'outside of its scoped volume'
        )
    })

    it('resolves metadata and a public URL without reading file bytes', async () => {
        const serverRoot = await temporaryRoot()
        const filePath = 'drawings/source.pdf'
        await mkdir(path.join(serverRoot, 'drawings'), { recursive: true })
        await writeFile(path.join(serverRoot, filePath), Buffer.from('pdf-content'))
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveFile(reference(filePath))).resolves.toEqual({
            name: 'source.pdf',
            filePath,
            workspacePath: filePath,
            fileUrl: `http://localhost/files/${filePath}`,
            url: `http://localhost/files/${filePath}`,
            size: 11,
            catalog: 'projects',
            scopeId: 'project-1'
        })
    })

    it('reports a missing workspace file with a storage-specific error', async () => {
        const serverRoot = await temporaryRoot()
        const service = createService(serverRoot, '/host/project-1')

        await expect(service.resolveFile(reference('drawings/missing.pdf'))).rejects.toThrow('Workspace file not found')
    })

    function createService(serverRoot: string, hostRoot: string) {
        const volume = new VolumeHandle(
            { tenantId: 'tenant-1', catalog: 'projects', projectId: 'project-1', userId: 'user-1' },
            serverRoot,
            hostRoot,
            'http://localhost/files'
        )
        return new WorkspaceFilesRuntimeCapabilityService(
            { execute: jest.fn() },
            { resolve: jest.fn().mockReturnValue(volume) }
        )
    }

    function reference(filePath: string) {
        return {
            source: 'platform.workspace.files' as const,
            tenantId: 'tenant-1',
            userId: 'user-1',
            catalog: 'projects' as const,
            scopeId: 'project-1',
            projectId: 'project-1',
            filePath,
            workspacePath: `/workspace/${filePath}`
        }
    }

    async function temporaryRoot(): Promise<string> {
        const root = await mkdtemp(path.join(tmpdir(), 'xpert-workspace-readonly-'))
        roots.push(root)
        return root
    }
})
