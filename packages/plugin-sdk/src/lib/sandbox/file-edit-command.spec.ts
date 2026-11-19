import { spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BaseSandbox } from './sandbox'
import type { ExecuteResponse } from './protocol'

class FileSandbox extends BaseSandbox {
  readonly id = 'edit-feedback-test'
  environment = { ...process.env }

  execute(command: string): ExecuteResponse {
    const result = spawnSync('/bin/sh', ['-c', command], {
      cwd: this.workingDirectory,
      env: this.environment,
      encoding: 'utf8'
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

describe('sandbox file edit feedback', () => {
  let root: string
  let sandbox: FileSandbox

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'xpert-edit-feedback-test-'))
    sandbox = new FileSandbox()
    sandbox.workingDirectory = root
    sandbox.environment = { ...process.env, TMPDIR: root, PATH: `${join(process.execPath, '..')}:${process.env.PATH}` }
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('compares the whole file independently of the replacement argument sizes', async () => {
    const oldText = Array.from({ length: 500 }, (_, i) => `第 ${i + 1} 行`).join('\n') + '\n'
    const newText = oldText.replace('第 250 行', '修正第 250 行')
    writeFileSync(join(root, 'body.md'), oldText)
    const result = await sandbox.edit('body.md', oldText, newText)
    expect(result).toMatchObject({
      oldLines: 500,
      newLines: 500,
      occurrences: 1,
      changed: true,
      diff: { removed: 1, added: 1 }
    })
    expect(readFileSync(join(root, 'body.md'), 'utf8')).toBe(newText)
    expect(readdirSync(root)).toEqual(['body.md'])
  })

  it('accepts identical text with a zero diff and leaves the file untouched', async () => {
    const path = join(root, 'body.md')
    writeFileSync(path, '“三检制”\n')
    utimesSync(path, 1000, 1000)
    const result = await sandbox.edit(path, '“三检制”', '“三检制”')
    expect(result).toMatchObject({
      oldLines: 1,
      newLines: 1,
      occurrences: 1,
      changed: false,
      diff: { removed: 0, added: 0 }
    })
    expect(result.error).toBeUndefined()
    expect(statSync(path).mtimeMs).toBe(1_000_000)
  })

  it.each([
    ['重复 重复\n', '重复', '修改', 1],
    ['重复\n重复\n', '重复', '修改', 2]
  ])('counts actual changed lines for replaceAll in %j', async (text, oldText, newText, changedLines) => {
    writeFileSync(join(root, 'body.md'), text)
    expect(await sandbox.edit('body.md', oldText, newText, true)).toMatchObject({
      oldLines: 1,
      newLines: 1,
      occurrences: 2,
      changed: true,
      diff: { removed: changedLines, added: changedLines }
    })
  })

  it.each([
    ['第一行\n第二行\n', '', 2, 0, 2, 0],
    ['第一行\r\n第二行\r\n', '第一行\r\n修正\r\n', 2, 2, 1, 1],
    ['第一行\n', '第一行', 1, 1, 1, 1],
    ['\n\n', '\n', 2, 1, 1, 0]
  ])(
    'handles deletion, line endings and empty lines in %j',
    async (oldText, newText, oldLines, newLines, removed, added) => {
      writeFileSync(join(root, 'body.md'), oldText)
      expect(await sandbox.edit('body.md', oldText, newText)).toMatchObject({
        oldLines,
        newLines,
        diff: { removed, added },
        changed: true
      })
    }
  )

  it('keeps shell metacharacters in paths and replacement text literal', async () => {
    const file = "报告 '$(touch injected)' `touch injected`.md"
    const oldText = "$(touch injected) '旧值' `touch injected`"
    const newText = "${value} '新值' $HOME"
    writeFileSync(join(root, file), oldText)
    const result = await sandbox.edit(file, oldText, newText)
    expect(result.diff).toEqual({ removed: 1, added: 1 })
    expect(readFileSync(join(root, file), 'utf8')).toBe(newText)
    expect(readdirSync(root)).toEqual([file])
    expect(JSON.stringify(result)).not.toContain(oldText)
  })

  it('retains existing match failures and accurately reports zero changes', async () => {
    writeFileSync(join(root, 'body.md'), '重复 重复')
    for (const [file, oldText] of [
      ['body.md', '不存在'],
      ['body.md', '重复'],
      ['missing.md', '旧值']
    ]) {
      const result = await sandbox.edit(file, oldText, '新值')
      expect(result.error).toBeTruthy()
      expect(result).toMatchObject({
        oldLines: 1,
        newLines: 1,
        occurrences: 0,
        changed: false,
        diff: { removed: 0, added: 0 }
      })
    }
    expect(readFileSync(join(root, 'body.md'), 'utf8')).toBe('重复 重复')
  })

  it('reports exact statistics without Git or temporary files', async () => {
    const bin = join(root, 'bin')
    mkdirSync(bin)
    symlinkSync(process.execPath, join(bin, 'node'))
    sandbox.environment.PATH = bin
    writeFileSync(join(root, 'body.md'), '旧值')
    const result = await sandbox.edit('body.md', '旧值', '新值')
    expect(result).toMatchObject({ oldLines: 1, newLines: 1, changed: true, diff: { removed: 1, added: 1 } })
    expect(result.error).toBeUndefined()
    expect(result.diffUnavailable).toBeUndefined()
    expect(readFileSync(join(root, 'body.md'), 'utf8')).toBe('新值')
    expect(readdirSync(root).sort()).toEqual(['bin', 'body.md'])
  })

  it('saves broad rewrites when the optional diff exceeds its comparison budget', async () => {
    const before = '旧内容\n'.repeat(2000)
    const after = '新内容\n'.repeat(2000)
    writeFileSync(join(root, 'body.md'), before)
    const result = await sandbox.edit('body.md', before, after)
    expect(result).toMatchObject({
      oldLines: 2000,
      newLines: 2000,
      changed: true,
      diffUnavailable: 'comparison_budget_exceeded'
    })
    expect(result.error).toBeUndefined()
    expect(result.diff).toBeUndefined()
    expect(readFileSync(join(root, 'body.md'), 'utf8')).toBe(after)
  })

  it('runs one bounded command for 12 dependent edits and commits the successful prefix on mismatch', async () => {
    writeFileSync(join(root, 'form.md'), 'value-0')
    const calls = jest.spyOn(sandbox, 'execute')
    const edits = Array.from({ length: 12 }, (_, i) => ({ oldString: 'value-' + i, newString: 'value-' + (i + 1) }))
    const result = await sandbox.multiEdit('form.md', [...edits, { oldString: 'missing', newString: 'late' }])
    expect(calls).toHaveBeenCalledTimes(1)
    expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 12, failedEdit: 13 })
    expect(readFileSync(join(root, 'form.md'), 'utf8')).toBe('value-12')
  })

  it('keeps indices across bounded batches and honors backends with custom edit implementations', async () => {
    writeFileSync(join(root, 'form.md'), 'pending')
    const calls = jest.spyOn(sandbox, 'execute')
    const edits = Array.from({ length: 40 }, () => ({ oldString: 'pending', newString: 'pending' }))
    expect((await sandbox.multiEdit('form.md', edits)).progress?.appliedEdits).toBe(40)
    expect(calls).toHaveBeenCalledTimes(2)
    const edit = jest.spyOn(sandbox, 'edit').mockResolvedValue({ error: 'backend refused' })
    expect((await sandbox.multiEdit('form.md', edits)).progress?.failedEdit).toBe(1)
    expect(edit).toHaveBeenCalledTimes(1)
    expect(calls).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['timeout', (r: ExecuteResponse) => ({ ...r, timedOut: true })],
    ['truncation', (r: ExecuteResponse) => ({ ...r, truncated: true })],
    ['malformed JSON', (r: ExecuteResponse) => ({ ...r, output: '{' })],
    ['invalid metrics', (r: ExecuteResponse) => ({ ...r, output: '[{"code":0,"metrics":{}}]' })],
    [
      'contradictory success',
      (r: ExecuteResponse) => {
        const steps = JSON.parse(r.output)
        steps[0].metrics.occurrences = 0
        return { ...r, output: JSON.stringify(steps) }
      }
    ],
    ['missing step', (r: ExecuteResponse) => ({ ...r, output: JSON.stringify(JSON.parse(r.output).slice(1)) })],
    [
      'lost response',
      () => {
        throw new Error('connection closed')
      }
    ]
  ] as const)(
    'keeps the confirmed prefix after %s without replaying or sending later edits',
    async (_, loseReceipt) => {
      writeFileSync(join(root, 'form.md'), 'v0')
      const execute = sandbox.execute.bind(sandbox)
      const calls = jest
        .spyOn(sandbox, 'execute')
        .mockImplementationOnce(execute)
        .mockImplementationOnce((command) => loseReceipt(execute(command)))
      const edits = Array.from({ length: 65 }, (_, i) => ({ oldString: 'v' + i, newString: 'v' + (i + 1) }))
      const result = await sandbox.multiEdit('form.md', edits)
      expect(result.error).toContain('Read the current file')
      expect(result.results).toHaveLength(32)
      expect(result.results?.every((r) => r.changed && r.occurrences === 1)).toBe(true)
      expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 32, unconfirmedEdits: { from: 33, to: 64 } })
      expect(calls).toHaveBeenCalledTimes(2)
      // The second batch really committed before its receipt was lost. Only 32 may be confirmed to the caller.
      expect(readFileSync(join(root, 'form.md'), 'utf8')).toBe('v64')
    }
  )

  it.each([1, 33])(
    'returns the confirmed prefix if the final single-edit batch of %i gets no receipt',
    async (count) => {
      writeFileSync(join(root, 'form.md'), 'v0')
      const execute = sandbox.execute.bind(sandbox)
      const calls = jest.spyOn(sandbox, 'execute')
      if (count > 1) calls.mockImplementationOnce(execute)
      calls.mockImplementationOnce(() => ({
        exitCode: null,
        truncated: false,
        output: '',
        terminationReason: 'deadline'
      }))
      const edits = Array.from({ length: count }, (_, i) => ({ oldString: 'v' + i, newString: 'v' + (i + 1) }))
      const result = await sandbox.multiEdit('form.md', edits)
      expect(result.results).toHaveLength(count - 1)
      expect(result.progress).toEqual({
        mode: 'sequential',
        appliedEdits: count - 1,
        unconfirmedEdits: { from: count, to: count }
      })
      expect(readFileSync(join(root, 'form.md'), 'utf8')).toBe('v' + (count - 1))
    }
  )

  it('reports a confirmed mismatch by its global index in the second batch', async () => {
    writeFileSync(join(root, 'form.md'), 'v0')
    const calls = jest.spyOn(sandbox, 'execute')
    const edits = Array.from({ length: 65 }, (_, i) => ({ oldString: 'v' + i, newString: 'v' + (i + 1) }))
    edits[34].oldString = 'missing'
    const result = await sandbox.multiEdit('form.md', edits)
    expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 34, failedEdit: 35 })
    expect(result.results).toHaveLength(35)
    expect(calls).toHaveBeenCalledTimes(2)
    expect(readFileSync(join(root, 'form.md'), 'utf8')).toBe('v34')
  })

  it('preserves the legacy empty-search no-op for direct SDK callers', async () => {
    writeFileSync(join(root, 'form.md'), '')
    const result = await sandbox.multiEdit('form.md', [{ oldString: '', newString: 'value' }])
    expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 1 })
    expect(result.results?.[0]).toMatchObject({ occurrences: 1 })
    expect(readFileSync(join(root, 'form.md'), 'utf8')).toBe('')
  })

  it('returns per-step statistics, accepts no-ops, and preserves partial batch progress', async () => {
    writeFileSync(join(root, 'body.md'), '原文\n')
    const result = await sandbox.multiEdit('body.md', [
      { oldString: '原文', newString: '修正' },
      { oldString: '修正', newString: '修正' },
      { oldString: '修正', newString: '原文' },
      { oldString: '不存在', newString: '未写入' },
      { oldString: '原文', newString: '不能执行' }
    ])
    expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 3, failedEdit: 4 })
    expect(result.results?.map((edit) => edit.diff)).toEqual([
      { removed: 1, added: 1 },
      { removed: 0, added: 0 },
      { removed: 1, added: 1 },
      { removed: 0, added: 0 }
    ])
    expect(readFileSync(join(root, 'body.md'), 'utf8')).toBe('原文\n')
  })
})
