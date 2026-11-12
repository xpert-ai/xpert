import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { pushApprovedBundle } from './git-process'

const execute = promisify(execFile)
describe('fixed Git bundle delivery / real local Git', () => {
  let directory: string, source: string, remote: string, commit: string, base: string, bundle: Buffer
  const branch = 'coding-delivery/test/v1'
  async function git(args: string[], cwd = source) {
    return (await execute('git', args, { cwd, env: { PATH: '/usr/bin:/bin:/usr/local/bin',
      HOME: directory, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.test',
      GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.test' } })).stdout.trim()
  }
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'coding-git-test-')); source = join(directory, 'source'); remote = join(directory, 'remote.git')
    await git(['init', '-b', 'main', source], directory); await git(['init', '--bare', remote], directory)
    await writeFile(join(source, 'README.md'), 'base'); await git(['add', 'README.md']); await git(['commit', '-m', 'base'])
    base = await git(['rev-parse', 'HEAD']); await git(['push', remote, 'main'])
    await writeFile(join(source, 'README.md'), 'approved candidate'); await git(['commit', '-am', 'candidate'])
    commit = await git(['rev-parse', 'HEAD']); const path = join(directory, 'source.bundle')
    await git(['bundle', 'create', path, `${base}..HEAD`]); bundle = await readFile(path)
  })
  afterEach(async () => { await rm(directory, { recursive: true, force: true }) })
  const input = () => ({ remoteUrl: remote, baseBranch: 'main', branch, commit, bundle,
    authorizationHeader: 'Authorization: Basic test-only', beforeWrite: jest.fn(async () => undefined) })
  it('imports the exact incremental bundle and creates the approved branch without changing main', async () => {
    const request = input(); await pushApprovedBundle(request)
    expect(await git(['rev-parse', `refs/heads/${branch}`], remote)).toBe(commit)
    expect(await git(['rev-parse', 'refs/heads/main'], remote)).toBe(base)
    expect(request.beforeWrite).toHaveBeenCalledTimes(1)
  })
  it('rejects even a fast-forward when another writer creates the branch during delivery', async () => {
    const request = input()
    request.beforeWrite.mockImplementation(async () => { await git(['update-ref', `refs/heads/${branch}`, base], remote) })
    await expect(pushApprovedBundle(request)).rejects.toThrow('CODING_GIT_COMMAND_FAILED')
    expect(await git(['rev-parse', `refs/heads/${branch}`], remote)).toBe(base)
  })
  it('rejects a missing approved commit before any remote write', async () => {
    const request = { ...input(), commit: 'b'.repeat(40) }
    await expect(pushApprovedBundle(request)).rejects.toThrow('CODING_GIT_COMMAND_FAILED')
    expect(request.beforeWrite).not.toHaveBeenCalled()
    expect(await git(['for-each-ref', '--format=%(refname)', 'refs/heads'], remote)).toBe('refs/heads/main')
  })
})
