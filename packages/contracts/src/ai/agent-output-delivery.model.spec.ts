import { agentOutputDeliverySchema } from './agent-output-delivery.model'
import { projectTaskDispatchInputSchema } from './project-task-runtime.model'

describe('Project task output delivery', () => {
  it('supports explicit exports without introducing a CLI discriminator', () => {
    const id = '11111111-1111-4111-a111-111111111111'
    expect(
      projectTaskDispatchInputSchema.parse({
        requestId: id,
        taskId: id,
        bindingId: id,
        expectedRevision: 1,
        delivery: { mode: 'files', paths: ['report.txt'] }
      }).delivery
    ).toEqual({ mode: 'files', paths: ['report.txt'] })
  })
  it.each(['/etc/passwd', '../secret', 'a/../b', 'a\\b', 'a//b', 'C:/secret'])(
    'rejects unsafe selection %s',
    (path) => {
      expect(agentOutputDeliverySchema.safeParse({ mode: 'files', paths: [path] }).success).toBe(false)
    }
  )
  it.each(['qa/*/totals.json', 'qa/*/*.js', '**/*.json', 'file?.txt', 'file[12].txt', '{a,b}.json'])(
    'rejects glob selection before delegation: %s',
    (path) => {
      for (const mode of ['files', 'archive']) {
        const parsed = agentOutputDeliverySchema.safeParse({ mode, paths: [path] })
        expect(parsed.success).toBe(false)
        if (!parsed.success) expect(parsed.error.issues[0].message).toContain('without wildcards')
      }
    }
  )
  it.each(['files', 'archive'])('accepts 128 exact paths and rejects 129 in %s mode', (mode) => {
    const paths = Array.from({ length: 128 }, (_, index) => `交付/结果-${index}.txt`)
    expect(agentOutputDeliverySchema.parse({ mode, paths })).toEqual({ mode, paths })
    expect(agentOutputDeliverySchema.safeParse({ mode, paths: [...paths, '交付/extra.txt'] }).success).toBe(false)
  })
  it('allows the executor to declare exact dynamic filenames when paths are omitted', () => {
    expect(agentOutputDeliverySchema.parse({ mode: 'files' })).toEqual({ mode: 'files' })
    expect(agentOutputDeliverySchema.parse({ mode: 'files', paths: ['qa/run-20261007/totals.json'] })).toEqual({
      mode: 'files',
      paths: ['qa/run-20261007/totals.json']
    })
  })
})
