import { agentOutputDeliverySchema, agentResultPathSchema, agentTaskResultSchema } from './results'

describe('portable task results', () => {
  it.each(['../secret', '/etc/passwd', 'nested/../secret', 'a\\b', 'a//b', './a', 'a\u0000b', 'C:/secret'])(
    'rejects a non-relative file selection: %s',
    (path) => {
      expect(agentResultPathSchema.safeParse(path).success).toBe(false)
    }
  )

  it('accepts explicit delivery without making ordinary findings into an export', () => {
    expect(agentOutputDeliverySchema.parse({ mode: 'none' })).toEqual({ mode: 'none' })
    expect(agentOutputDeliverySchema.parse({ mode: 'files', paths: ['src/计算器.py'] })).toEqual({
      mode: 'files',
      paths: ['src/计算器.py']
    })
    expect(agentOutputDeliverySchema.safeParse({ mode: 'none', paths: ['file.txt'] }).success).toBe(false)
    expect(agentOutputDeliverySchema.safeParse({ mode: 'archive', paths: [] }).success).toBe(false)
    expect(agentOutputDeliverySchema.safeParse({ mode: 'files', paths: Array(33).fill('file.txt') }).success).toBe(
      false
    )
  })

  it('uses explicit result kinds and keeps execution findings separate from delivery', () => {
    const result = {
      version: 1,
      summary: 'Checked',
      items: [
        { type: 'analysis', id: 'review', title: 'Review', summary: 'A finding' },
        {
          type: 'changes',
          id: 'code',
          title: 'Changes',
          summary: 'Edited',
          files: [{ path: 'main.py', change: 'modified' }]
        },
        { type: 'tests', id: 'tests', title: 'Tests', summary: 'Not run', status: 'skipped' },
        { type: 'file', id: 'report', title: 'Report', summary: 'Deliverable', path: 'report.txt' }
      ]
    }
    expect(agentTaskResultSchema.parse(result)).toEqual(result)
    expect(
      agentTaskResultSchema.safeParse({
        ...result,
        items: [{ type: 'archive', id: 'a', title: 'Archive', summary: '' }]
      }).success
    ).toBe(false)
    expect(agentTaskResultSchema.safeParse({ ...result, items: [result.items[0], result.items[0]] }).success).toBe(
      false
    )
    expect(agentTaskResultSchema.safeParse({ ...result, artifacts: [{ id: 'invented' }] }).success).toBe(false)
  })
})
