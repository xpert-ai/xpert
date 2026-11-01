import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { workspaceRelativeFilePathSchema } from '../runtime/workspace-file-tools'
import { BaseSandbox } from './sandbox'
import type { ExecuteResponse } from './protocol'

class DiscoverySandbox extends BaseSandbox {
  readonly id = 'file-discovery-test'
  execute(command: string): ExecuteResponse {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: this.workingDirectory,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(process.execPath, '..')}:${process.env.PATH}` }
    })
    if (result.error) throw result.error
    return { exitCode: result.status, output: result.stdout + result.stderr, truncated: false }
  }
  uploadFiles(): never {
    throw new Error('Unexpected upload')
  }
  downloadFiles(): never {
    throw new Error('Unexpected download')
  }
}

describe('workspace-relative sandbox discovery', () => {
  let root: string
  let sandbox: DiscoverySandbox
  const recipe = '.xpert/skills/xpert/live-dashboard/examples/production-quality'

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xpert-discovery-'))
    sandbox = new DiscoverySandbox()
    sandbox.workingDirectory = root
    mkdirSync(join(root, recipe, 'nested'), { recursive: true })
    writeFileSync(join(root, recipe, 'README.md'), 'Production quality recipe\n')
    writeFileSync(join(root, recipe, 'nested', '质量 数据.md'), 'Production quality data\n')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('lists nested files as complete relative paths that can be read unchanged', async () => {
    const listing = await sandbox.listDir(join(root, recipe))
    expect(listing).toContain(`Workspace-relative directory: ${recipe}\n`)
    expect(listing).not.toContain(root)
    expect(listing).not.toContain('Absolute path:')
    const files = listing
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('.md'))
    expect(files.sort()).toEqual([`${recipe}/README.md`, `${recipe}/nested/质量 数据.md`].sort())
    for (const file of files) {
      expect(workspaceRelativeFilePathSchema.parse(file)).toBe(file)
      expect(await sandbox.read(join(root, file))).toContain('L1: Production quality')
    }
  })

  it('keeps root, empty directories, depth, pagination and symlink markers portable', async () => {
    mkdirSync(join(root, 'empty'))
    symlinkSync(join(root, recipe), join(root, 'linked'))
    expect(await sandbox.listDir(join(root, 'empty'))).toBe('Workspace-relative directory: empty\n(Empty directory)\n')
    const rootListing = await sandbox.listDir(root, 1, 25, 1)
    expect(rootListing).toContain('Workspace-relative directory: .\n')
    expect(rootListing).toContain('linked@')
    expect(rootListing).not.toContain('linked/README.md')
    const first = await sandbox.listDir(join(root, recipe), 1, 1, 1)
    const second = await sandbox.listDir(join(root, recipe), 2, 1, 1)
    expect(first).toContain('More than 1 entries found')
    expect(first).not.toContain('质量 数据.md')
    expect(second).not.toEqual(first)
    expect(first + second).not.toContain(root)
  })

  it('returns workspace-relative glob and grep labels without rewriting matching file content', async () => {
    const glob = await sandbox.glob('**/*.md', join(root, '.xpert'))
    expect(glob).toContain(`${recipe}/README.md`)
    expect(glob).toContain(`${recipe}/nested/质量 数据.md`)
    expect(glob).not.toContain(root)
    for (const file of glob.split('\n')) {
      expect(workspaceRelativeFilePathSchema.parse(file)).toBe(file)
      expect(await sandbox.read(join(root, file))).toContain('Production quality')
    }
    const grep = await sandbox.grep('Production', join(root, recipe), '*.md')
    expect(grep).toContain(`${recipe}/README.md:`)
    expect(grep).not.toContain(root)
    writeFileSync(join(root, recipe, 'README.md'), `source path in user content: ${root}\n`)
    const content = await sandbox.grep('source path', join(root, recipe), '*.md')
    expect(content).toContain(`${recipe}/README.md:`)
    expect(content).toContain(`source path in user content: ${root}`)
    const rawPaths = (await sandbox.globInfo('**/*.md', join(root, '.xpert'))).map((file) => file.path)
    expect(rawPaths).toContain('skills/xpert/live-dashboard/examples/production-quality/README.md')
    expect(await sandbox.glob('**/*.md')).toContain(`${recipe}/README.md`)
    expect(await sandbox.grep('source path')).toContain(`${recipe}/README.md:`)
  })

  it('does not turn a backend path outside the workspace into a relative tool result', async () => {
    jest.spyOn(sandbox, 'globInfo').mockResolvedValue([{ path: '/other-workspace/private.md' }])
    await expect(sandbox.glob('*.md', root)).rejects.toThrow('outside the workspace')
    await expect(sandbox.listDir(join(root, '..'))).rejects.toThrow('outside the workspace')
  })
})
