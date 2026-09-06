import { z } from 'zod/v3'
import { prepareToolResult, resolveToolResult } from './prepared-result'

const schema = z.union([
  z.object({ value: z.string() }).strict(),
  z.object({ resultStatus: z.literal('unavailable'), operationId: z.string() }).strict()
])

describe('prepared tool results', () => {
  it('projects and validates once on the normal path without constructing recovery', async () => {
    const project = jest.fn(() => ({ value: 'normal' }))
    const recover = jest.fn(() => ({ resultStatus: 'unavailable' as const, operationId: 'op' }))
    const validate = jest.fn((value) => schema.parseAsync(value))
    await expect(resolveToolResult(prepareToolResult(project, recover), validate)).resolves.toEqual({ value: 'normal' })
    expect(project).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledTimes(1)
    expect(recover).not.toHaveBeenCalled()
  })
  it.each(['projection', 'validation', 'serialization'])(
    'validates a minimal receipt after %s fails',
    async (stage) => {
      const project = jest.fn(() => {
        if (stage === 'projection') throw new Error('private source data')
        return stage === 'validation' ? { value: 123, privateData: 'secret' } : { value: 'normal' }
      })
      const recover = jest.fn(() => ({ resultStatus: 'unavailable' as const, operationId: 'op' }))
      const validate = jest.fn(async (value) => {
        const parsed = await schema.parseAsync(value)
        if (stage === 'serialization' && 'value' in parsed) throw new Error('private serialization details')
        return parsed
      })
      await expect(resolveToolResult(prepareToolResult(project, recover), validate)).resolves.toEqual({
        resultStatus: 'unavailable',
        operationId: 'op'
      })
      expect(project).toHaveBeenCalledTimes(1)
      expect(validate).toHaveBeenCalledTimes(stage === 'projection' ? 1 : 2)
      expect(JSON.stringify(recover.mock.calls)).not.toMatch(/secret|private source|private serialization/)
    }
  )
  it('rejects a malformed recovery instead of sending unchecked output', async () => {
    const prepared = prepareToolResult(
      () => ({ value: 42 }),
      () => ({ resultStatus: 'unavailable', operationId: 42 })
    )
    await expect(resolveToolResult(prepared, (value) => schema.parseAsync(value))).rejects.toThrow()
  })
})
