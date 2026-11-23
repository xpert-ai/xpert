import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BaseSandbox } from './sandbox'
import type { ExecuteResponse } from './protocol'

class ReadSandbox extends BaseSandbox {
  readonly id = 'read-long-lines'
  clipped = false
  execute(command: string): ExecuteResponse {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: this.workingDirectory,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(process.execPath, '..')}:${process.env.PATH}` }
    })
    if (result.error) throw result.error
    return { exitCode: result.status, output: result.stdout + result.stderr, truncated: this.clipped }
  }
  uploadFiles(): never {
    throw new Error('Unexpected upload')
  }
  downloadFiles(): never {
    throw new Error('Unexpected download')
  }
}

describe('exact sandbox file reads', () => {
  let root: string
  let sandbox: ReadSandbox
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xpert-read-'))
    sandbox = new ReadSandbox()
    sandbox.workingDirectory = root
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it.each(['slice', 'indentation'] as const)(
    'reads a complete long Unicode JSON line in %s mode, allowing one exact edit',
    async (mode) => {
      const observation = '核验原件及末尾字符🧱。'.repeat(150) + '结束标记'
      const before = JSON.stringify({ observations: observation, valid: true }, null, 2)
      writeFileSync(join(root, 'review.json'), before)
      const read = await sandbox.read('review.json', 1, 20, mode, { anchor_line: 2, include_siblings: true })
      expect(read).toContain('L2: ')
      const line = read
        .split('\n')
        .find((row) => row.startsWith('L2: '))!
        .slice(4)
      expect(line).toBe(before.split('\n')[1])
      const after = line.replace('结束标记', '已核实')
      expect(await sandbox.edit('review.json', line, after)).toMatchObject({ occurrences: 1, changed: true })
      expect(JSON.parse(readFileSync(join(root, 'review.json'), 'utf8')).observations).toBe(
        observation.replace('结束标记', '已核实')
      )
    }
  )
  it('preserves line pagination and reports backend clipping explicitly', async () => {
    writeFileSync(join(root, 'body.md'), 'first\n' + '长'.repeat(1200) + '\nlast')
    expect(await sandbox.read('body.md', 2, 1)).toBe('L2: ' + '长'.repeat(1200) + '\n')
    sandbox.clipped = true
    expect(await sandbox.read('body.md', 2, 1)).toContain('Read output truncated')
  })
})
