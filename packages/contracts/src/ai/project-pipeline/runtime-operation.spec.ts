import { projectPipelineRuntimeInputSchema, projectPipelineOperationReceiptSchema } from './operation.schema'
const id = '00000000-0000-4000-8000-000000000001'

it('accepts bounded Runtime input without credential or dispatch identity overrides', () => {
  expect(
    projectPipelineRuntimeInputSchema.parse({ prompt: 'Assess pinned input', parameters: { revision: '1' } })
  ).toBeDefined()
  for (const extra of [
    { scope: {} },
    { dispatch: {} },
    { callId: id },
    { files: [] },
    { prompt: 'x'.repeat(100001) }
  ]) {
    expect(projectPipelineRuntimeInputSchema.safeParse({ prompt: 'Assess pinned input', ...extra }).success).toBe(false)
  }
})
it('preserves Runtime status as an explicit receipt variant and rejects mixed identities', () => {
  const execution = {
    kind: 'runtime_invocation',
    invocationId: id,
    bindingId: id,
    provider: 'neutral',
    revision: '1',
    status: 'cancelling'
  }
  expect(projectPipelineOperationReceiptSchema.parse({ status: 'pending', receiptKey: id, execution })).toBeDefined()
  expect(
    projectPipelineOperationReceiptSchema.safeParse({
      status: 'pending',
      receiptKey: id,
      execution: { ...execution, executionId: id }
    }).success
  ).toBe(false)
  expect(
    projectPipelineOperationReceiptSchema.safeParse({
      status: 'pending',
      receiptKey: id,
      execution: { ...execution, invocationId: 'invalid' }
    }).success
  ).toBe(false)
})
