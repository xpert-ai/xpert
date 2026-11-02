import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { stagePortableGit } from './agent-plugin-source'
import { PackagePathEscapeError } from './agent-plugin-path'

jest.mock('node:child_process', () => {
    const actual = jest.requireActual<typeof import('node:child_process')>('node:child_process')
    const execute = jest.fn()
    return {
        ...actual,
        execFile: Object.defineProperty(jest.fn(), Symbol.for('nodejs.util.promisify.custom'), { value: execute })
    }
})

// Execute real Git against a filter-capable file transport; only the HTTPS fixture URL/transport is replaced.
const execute = jest.mocked(promisify(execFile))
const realExec = promisify(jest.requireActual<typeof import('node:child_process')>('node:child_process').execFile)
const url = 'https://fixture.invalid/plugins.git'
const git = (args: string[]) =>
    realExec('git', args, {
        env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0' }
    })

describe('portable Git partial downloads', () => {
    let repository: string
    let firstCommit: string
    let latestCommit: string
    let temporary: string[]

    beforeAll(async () => {
        repository = await mkdtemp(join(tmpdir(), 'portable-git-fixture-'))
        await git(['init', '--initial-branch=main', repository])
        for (const [name, value] of [
            ['user.name', 'Fixture'],
            ['user.email', 'fixture@example.invalid'],
            ['commit.gpgsign', 'false'],
            ['uploadpack.allowFilter', 'true']
        ])
            await git(['-C', repository, 'config', name, value])
        for (const directory of ['agent-plugins/basic', 'assets', 'nested/plugins[1]', 'nested/plugins1']) {
            await mkdir(join(repository, directory), { recursive: true })
        }
        await writeFile(join(repository, 'agent-plugins/basic/plugin.json'), '{"version":1}')
        await writeFile(join(repository, 'agent-plugins/quickstart.json'), '{"version":1,"plugins":[]}')
        await writeFile(join(repository, 'root.bin'), randomBytes(1024 * 1024))
        await writeFile(join(repository, 'assets/unrelated.bin'), randomBytes(1024 * 1024))
        await writeFile(join(repository, 'nested/ancestor.bin'), randomBytes(1024 * 1024))
        await writeFile(join(repository, 'nested/plugins[1]/plugin.json'), 'literal directory')
        await writeFile(join(repository, 'nested/plugins1/plugin.json'), 'unwanted pattern match')
        await git(['-C', repository, 'add', '.'])
        await git(['-C', repository, 'commit', '-m', 'First snapshot'])
        firstCommit = (await git(['-C', repository, 'rev-parse', 'HEAD'])).stdout.trim()
        await git(['-C', repository, 'tag', '-a', 'v1', '-m', 'First version'])
        await writeFile(join(repository, 'agent-plugins/basic/plugin.json'), '{"version":2}')
        await git(['-C', repository, 'commit', '-am', 'Second snapshot'])
        latestCommit = (await git(['-C', repository, 'rev-parse', 'HEAD'])).stdout.trim()
    })

    beforeEach(() => {
        temporary = []
        execute.mockReset().mockImplementation((file, args, options) => {
            if (args[0] === 'init') temporary.push(args[1])
            return realExec(
                file,
                args.map((arg) =>
                    arg === url
                        ? pathToFileURL(repository).href
                        : arg === 'protocol.file.allow=never'
                          ? 'protocol.file.allow=always'
                          : arg
                ),
                { ...options, encoding: 'utf8' }
            )
        })
    })

    afterEach(async () => {
        await Promise.all(temporary.map((path) => rm(path, { recursive: true, force: true })))
    })
    afterAll(() => rm(repository, { recursive: true, force: true }))

    async function missingBlobIds(temp: string) {
        // --missing=print inspects the object store without lazily downloading missing blobs.
        const { stdout } = await git(['-C', temp, 'rev-list', '--objects', '--missing=print', 'HEAD'])
        return new Set(
            stdout
                .split('\n')
                .filter((line) => line.startsWith('?'))
                .map((line) => line.slice(1))
        )
    }
    async function blobId(path: string) {
        return (await git(['-C', repository, 'rev-parse', `HEAD:${path}`])).stdout.trim()
    }

    it('downloads selected files while leaving root and sibling blobs absent', async () => {
        const staged = await stagePortableGit(url, 'main', './agent-plugins/')
        expect(staged.commit).toBe(latestCommit)
        expect(await readFile(join(staged.root, 'basic/plugin.json'), 'utf8')).toBe('{"version":2}')
        expect(await readdir(staged.temp)).toEqual(['.git', 'agent-plugins'])
        const missing = await missingBlobIds(staged.temp)
        expect(missing.has(await blobId('root.bin'))).toBe(true)
        expect(missing.has(await blobId('assets/unrelated.bin'))).toBe(true)
        expect(missing.has(await blobId('agent-plugins/basic/plugin.json'))).toBe(false)
        expect((await git(['-C', staged.temp, 'rev-list', '--count', 'HEAD'])).stdout.trim()).toBe('1')
    })

    it('selects a nested directory literally without downloading ancestor files or matching a glob', async () => {
        const staged = await stagePortableGit(url, 'main', 'nested/plugins[1]')
        expect(await readFile(join(staged.root, 'plugin.json'), 'utf8')).toBe('literal directory')
        expect(await readdir(join(staged.temp, 'nested'))).toEqual(['plugins[1]'])
        const missing = await missingBlobIds(staged.temp)
        expect(missing.has(await blobId('nested/ancestor.bin'))).toBe(true)
        expect(missing.has(await blobId('nested/plugins1/plugin.json'))).toBe(true)
    })

    it.each(['commit', 'tag'])('preserves a pinned %s instead of importing the current branch', async (kind) => {
        const staged = await stagePortableGit(url, kind === 'commit' ? firstCommit : 'refs/tags/v1', 'agent-plugins')
        expect(await readFile(join(staged.root, 'basic/plugin.json'), 'utf8')).toBe('{"version":1}')
        expect((await git(['-C', staged.temp, 'rev-parse', 'HEAD'])).stdout.trim()).toBe(firstCommit)
    })

    it('continues downloading the complete snapshot for a root package', async () => {
        const staged = await stagePortableGit(url, 'main')
        expect(staged.commit).toBe(latestCommit)
        expect(staged.root).toBe(await realpath(staged.temp))
        expect((await stat(join(staged.root, 'assets/unrelated.bin'))).size).toBe(1024 * 1024)
        expect((await missingBlobIds(staged.temp)).size).toBe(0)
    })

    it.each(['../outside', '/absolute', 'agent-plugins\n/*', 'agent-plugins/../../outside', 'agent-plugins\\outside'])(
        'rejects unsafe sparse selection %j before invoking Git',
        async (directory) => {
            await expect(stagePortableGit(url, 'main', directory)).rejects.toBeInstanceOf(PackagePathEscapeError)
            expect(execute).not.toHaveBeenCalled()
        }
    )

    it.each([
        ['missing-ref', 'agent-plugins'],
        ['main', 'missing-directory']
    ])('cleans staging files when %s / %s cannot be fetched', async (ref, directory) => {
        await expect(stagePortableGit(url, ref, directory)).rejects.toThrow()
        expect(temporary).toHaveLength(1)
        await expect(stat(temporary[0])).rejects.toMatchObject({ code: 'ENOENT' })
    })
})
