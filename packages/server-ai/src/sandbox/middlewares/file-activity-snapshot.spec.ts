import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshotWorkspace, workspaceRelativePath } from './file-activity-snapshot'
const exec = promisify(execFile)

describe('sandbox file observation boundary', () => {
    let directory: string
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'xpert-file-activity-'))
    })
    afterEach(async () => {
        await rm(directory, { recursive: true, force: true })
    })
    const backend = (workingDirectory: string, pythonPath?: string) => ({
        workingDirectory,
        execute: async (command: string) => {
            const { stdout } = await exec('/bin/sh', ['-c', command], {
                maxBuffer: 1024 * 1024,
                ...(pythonPath ? { env: { ...process.env, PYTHONPATH: pythonPath } } : {})
            })
            return { output: stdout, exitCode: 0, truncated: false }
        }
    })
    it('observes text and binary bytes but never symlink targets or dependency trees', async () => {
        await writeFile(join(directory, 'spec.json'), '{"value":1}')
        await writeFile(join(directory, 'report.xlsx'), Buffer.from([0, 1, 2, 3]))
        await mkdir(join(directory, 'node_modules'))
        await writeFile(join(directory, 'node_modules', 'ignored.js'), 'dependency')
        await symlink('/etc/passwd', join(directory, 'outside'))
        const result = await snapshotWorkspace(backend(directory))
        expect(result.files.map((file) => file.path)).toEqual(['report.xlsx', 'spec.json'])
        expect(result.files[0].text).toBeUndefined()
        expect(result.files[1].text).toBe('{"value":1}')
        expect(result.skipped).toBe(1)
        expect(result.complete).toBe(false)
    })
    it('reports a missing file without confusing a denied symlink with absence', async () => {
        expect(await snapshotWorkspace(backend(directory), 'missing.txt')).toMatchObject({ files: [], complete: true })
        await symlink('/etc/passwd', join(directory, 'outside'))
        expect(await snapshotWorkspace(backend(directory), 'outside')).toMatchObject({ files: [], complete: false })
    })
    it.each(['EACCES', 'EIO'])(
        'marks directory traversal %s as incomplete without losing readable files',
        async (errorCode) => {
            const workspace = join(directory, 'workspace')
            const pythonPath = join(directory, 'faults')
            await mkdir(join(workspace, 'restricted'), { recursive: true })
            await mkdir(pythonPath)
            await writeFile(join(workspace, 'restricted', 'existing.txt'), 'still here')
            await writeFile(join(workspace, 'readable.txt'), 'readable')
            const before = await snapshotWorkspace(backend(workspace))
            expect(before.complete).toBe(true)
            expect(before.files).toHaveLength(2)
            // Fault injection also works in root-run CI, where chmod cannot deny reads.
            await writeFile(
                join(pythonPath, 'sitecustomize.py'),
                `
import os,errno
original_scandir=os.scandir
def scandir(path):
 if os.path.basename(path)=='restricted': raise OSError(errno.${errorCode},'scan failed',path)
 return original_scandir(path)
os.scandir=scandir
`
            )
            const after = await snapshotWorkspace(backend(workspace, pythonPath))
            expect(after).toMatchObject({ skipped: 1, complete: false })
            expect(after.files.map((file) => file.path)).toEqual(['readable.txt'])
            expect(await readFile(join(workspace, 'restricted', 'existing.txt'), 'utf8')).toBe('still here')
        }
    )
    it('marks an unavailable workspace root as incomplete', async () => {
        expect(await snapshotWorkspace(backend(join(directory, 'missing-root')))).toEqual({
            files: [],
            skipped: 1,
            complete: false
        })
    })
    it('rejects symlinked parent directories even when their target remains inside the workspace', async () => {
        await mkdir(join(directory, 'real'))
        await writeFile(join(directory, 'real', 'file.json'), '{}')
        await symlink(join(directory, 'real'), join(directory, 'alias'))
        expect(await snapshotWorkspace(backend(directory), 'alias/file.json')).toMatchObject({
            files: [],
            complete: false
        })
    })
    it('rejects escaped, absolute and internal delivery paths', () => {
        for (const path of ['../private', '/etc/passwd', 'C:/private', 'a/../../b', '.xpert/token', 'a\\b'])
            expect(() => workspaceRelativePath(path)).toThrow()
        expect(workspaceRelativePath('./reports/final.json')).toBe('reports/final.json')
    })
})
