import { agentOutputDeliverySchema, agentResultPathSchema, agentDeliveryRecoverySchema } from './results'

describe('portable task results', () => {
  it('selects a Markdown report path without model-supplied identity or digest', () => {
    expect(agentOutputDeliverySchema.parse({ mode: 'none', reportPath: 'output/报告.md' })).toEqual({
      mode: 'none',
      reportPath: 'output/报告.md'
    })
    expect(agentOutputDeliverySchema.safeParse({ mode: 'none', reportPath: '../secret' }).success).toBe(false)
    expect(agentDeliveryRecoverySchema.parse({ expectedRevision: 3, paths: ['plugin.tgz'] })).toEqual({
      expectedRevision: 3,
      paths: ['plugin.tgz']
    })
    expect(agentDeliveryRecoverySchema.safeParse({ expectedRevision: 3, reportPath: 'other.md' }).success).toBe(false)
  })
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
    expect(
      agentOutputDeliverySchema.safeParse({
        mode: 'files',
        paths: Array.from({ length: 129 }, (_, index) => `file-${index}.txt`)
      }).success
    ).toBe(false)
  })
})
