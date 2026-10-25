import { editCommandResult, sequentialFileEdits } from './file-edits'
import type { EditOperation } from './protocol'

const edits: EditOperation[] = [
  { oldString: 'a', newString: 'b' },
  { oldString: 'missing', newString: 'c' },
  { oldString: 'b', newString: 'd' }
]
describe('sequential file edits', () => {
  it('reports persisted progress and stops at the first failure', async () => {
    let content = 'a'
    const apply = jest.fn((edit: EditOperation) => {
      if (!content.includes(edit.oldString)) return { error: 'not found' }
      content = content.replace(edit.oldString, edit.newString)
      return { path: 'file', occurrences: 1 }
    })
    const result = await sequentialFileEdits('file', edits, apply)
    expect(content).toBe('b')
    expect(apply).toHaveBeenCalledTimes(2)
    expect(result.progress).toEqual({ mode: 'sequential', appliedEdits: 1, failedEdit: 2 })
    expect(result.results).toHaveLength(2)
    const recovery = await sequentialFileEdits('file', [edits[2]], apply)
    expect(content).toBe('d')
    expect(recovery.error).toBeUndefined()
    expect(recovery.progress).toEqual({ mode: 'sequential', appliedEdits: 1 })
  })
  it('does not call the backend for an empty batch or swallow transport failures', async () => {
    const apply = jest.fn().mockRejectedValue(new Error('unavailable'))
    expect((await sequentialFileEdits('file', [], apply)).progress?.appliedEdits).toBe(0)
    // Preserve BaseSandbox's runtime handling of missing batches from JavaScript callers.
    for (const missing of [null, undefined]) {
      const result = await Reflect.apply(sequentialFileEdits, undefined, ['file', missing, apply])
      expect(result.error).toBe('No edits provided')
      expect(result.progress?.appliedEdits).toBe(0)
    }
    expect(apply).not.toHaveBeenCalled()
    await expect(sequentialFileEdits('file', edits, apply)).rejects.toThrow('unavailable')
  })
  it('preserves command failures and occurrence counts', () => {
    expect(editCommandResult('file', { exitCode: 0, output: '3', truncated: false }).occurrences).toBe(3)
    for (const exitCode of [1, 2, 3, 9, null]) {
      expect(editCommandResult('file', { exitCode, output: '', truncated: false }).error).toBeTruthy()
    }
  })
  it('keeps structured metrics and does not mistake unavailable statistics for a zero diff', () => {
    const metrics = { occurrences: 1, oldLines: 500, newLines: 500, changed: true, diff: { removed: 1, added: 1 } }
    expect(editCommandResult('file', { exitCode: 0, output: JSON.stringify(metrics), truncated: false })).toEqual({
      path: 'file',
      filesUpdate: null,
      ...metrics
    })
    const unavailable = {
      occurrences: 1,
      oldLines: 1,
      newLines: 1,
      changed: true,
      diffUnavailable: 'comparison_budget_exceeded'
    }
    const result = editCommandResult('file', { exitCode: 0, output: JSON.stringify(unavailable), truncated: false })
    expect(result.diffUnavailable).toBe('comparison_budget_exceeded')
    expect(result.diff).toBeUndefined()
  })
})
