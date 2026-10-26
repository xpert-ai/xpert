import { runInNewContext } from 'node:vm'
import { FILE_EDIT_DIFF_SCRIPT } from './file-edit-diff'

/** Independent LCS oracle for short inputs; deliberately avoids the production diff algorithm. */
function referenceDiff(before: string, after: string) {
  const oldLines = before.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const newLines = after.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const lengths = Array.from({ length: oldLines.length + 1 }, () => Array<number>(newLines.length + 1).fill(0))
  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      lengths[i][j] =
        oldLines[i - 1] === newLines[j - 1] ? lengths[i - 1][j - 1] + 1 : Math.max(lengths[i - 1][j], lengths[i][j - 1])
    }
  }
  const common = lengths[oldLines.length][newLines.length]
  return { diff: { removed: oldLines.length - common, added: newLines.length - common } }
}

describe('sandbox in-memory line diff', () => {
  it('matches an independent LCS oracle for repeated lines, insertions, deletions and rearrangements', () => {
    const texts = ['']
    let level = ['']
    for (let length = 1; length <= 3; length++) {
      level = level.flatMap((prefix) => ['甲\n', '乙\n', '\n'].map((line) => prefix + line))
      texts.push(...level)
    }
    texts.push('甲', '乙', '甲\n乙', '甲\r\n乙\r\n', '甲\n乙\n甲\n乙\n', '乙\n甲\n乙\n甲\n')
    const cases = texts.flatMap((before) => texts.map((after) => [before, after]))
    const results: unknown = runInNewContext(
      `${FILE_EDIT_DIFF_SCRIPT}; cases.map(([before, after]) => inspectLineDiff(before, after))`,
      { cases }
    )
    expect(results).toEqual(cases.map(([before, after]) => referenceDiff(before, after)))
  })

  it('retains distant changes while excluding the unchanged lines between them', () => {
    const before = Array.from({ length: 5000 }, (_, i) => `原文 ${i}\n`).join('')
    const after = before.replace('原文 10\n', '修订 10\n').replace('原文 4900\n', '修订 4900\n')
    const result: unknown = runInNewContext(`${FILE_EDIT_DIFF_SCRIPT}; inspectLineDiff(before, after)`, {
      before,
      after
    })
    expect(result).toEqual({ diff: { removed: 2, added: 2 } })
  })

  it('bounds comparison work without claiming zero changes for a broad rewrite', () => {
    const before = '旧内容\n'.repeat(2000)
    const after = '新内容\n'.repeat(2000)
    const result: unknown = runInNewContext(`${FILE_EDIT_DIFF_SCRIPT}; inspectLineDiff(before, after)`, {
      before,
      after
    })
    expect(result).toEqual({ diffUnavailable: 'comparison_budget_exceeded' })
  })
})
