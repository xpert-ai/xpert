import fsPromises from 'fs/promises'
import os from 'os'
import path from 'path'
import { WorkspaceVolumeClient } from './workspace-volume'

describe('WorkspaceVolumeClient', () => {
    let tempRoot: string
    let workspaceVolume: WorkspaceVolumeClient
    const baseUrl = 'http://localhost:3000/api/sandbox/volume/user/user-1'

    beforeEach(async () => {
        tempRoot = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'workspace-volume-'))
        workspaceVolume = new WorkspaceVolumeClient({
            getVolumePath: (filePath?: string) => (filePath ? path.join(tempRoot, filePath) : tempRoot),
            getPublicUrl: (filePath: string) => (filePath ? `${baseUrl}/${filePath.replace(/^\/+/, '')}` : baseUrl)
        })

        await fsPromises.mkdir(path.join(tempRoot, 'thread-1', 'docs'), { recursive: true })
        await fsPromises.writeFile(path.join(tempRoot, 'thread-1', 'README.md'), '# Workspace\n', 'utf8')
        await fsPromises.writeFile(path.join(tempRoot, 'thread-1', 'docs', 'guide.md'), '# Guide\n', 'utf8')
        await fsPromises.writeFile(path.join(tempRoot, 'thread-1', 'binary.bin'), Buffer.from([0, 1, 2, 3]))
    })

    afterEach(async () => {
        await fsPromises.rm(tempRoot, { recursive: true, force: true })
        jest.clearAllMocks()
    })

    it('lists workspace files relative to the workspace root', async () => {
        const files = await workspaceVolume.list('thread-1')

        expect(files.map((file) => file.fullPath)).toEqual(expect.arrayContaining(['/README.md', '/docs', '/binary.bin']))
        expect(files.find((file) => file.filePath === 'README.md')?.url).toContain('/thread-1/README.md')
    })

    it('reads text files and keeps binary files read-only', async () => {
        await expect(workspaceVolume.readFile('thread-1', 'README.md')).resolves.toMatchObject({
            filePath: 'README.md',
            contents: '# Workspace\n'
        })

        await expect(workspaceVolume.readFile('thread-1', 'binary.bin')).resolves.toMatchObject({
            filePath: 'binary.bin',
            contents: undefined
        })
    })

    it('writes editable text files inside the current workspace only', async () => {
        const saved = await workspaceVolume.saveFile('thread-1', 'docs/guide.md', '# Updated Guide\n')

        expect(saved).toMatchObject({
            filePath: 'docs/guide.md',
            contents: '# Updated Guide\n'
        })
        await expect(fsPromises.readFile(path.join(tempRoot, 'thread-1', 'docs', 'guide.md'), 'utf8')).resolves.toBe(
            '# Updated Guide\n'
        )
    })

    it('rejects editing binary files even when they exist inside the workspace', async () => {
        await expect(workspaceVolume.saveFile('thread-1', 'binary.bin', 'nope')).rejects.toThrow(
            'This file type cannot be edited'
        )
    })

    it('rejects path traversal outside the workspace root', async () => {
        await expect(workspaceVolume.readFile('thread-1', '../outside.md')).rejects.toThrow(
            'Invalid conversation file path'
        )
        await expect(workspaceVolume.saveFile('thread-1', '../outside.md', 'nope')).rejects.toThrow(
            'Invalid conversation file path'
        )
        await expect(workspaceVolume.list('thread-1', { path: '../outside' })).rejects.toThrow(
            'Invalid conversation file path'
        )
    })
})
