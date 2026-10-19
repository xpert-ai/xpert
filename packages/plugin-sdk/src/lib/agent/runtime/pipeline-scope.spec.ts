import { projectPipelineInvocationScopeSchema } from './pipeline-scope'

const id = '00000000-0000-4000-8000-000000000001'
const origin = {
  instanceId: id,
  runId: id,
  roundId: id,
  nodeInstanceId: id,
  operationId: id,
  inputDigest: 'a'.repeat(64),
  generation: 1
}
const scope = {
  tenantId: id,
  organizationId: id,
  userId: id,
  projectId: id,
  workspaceId: id,
  callerType: 'project_pipeline',
  callerAgentKey: 'pipeline_node',
  parentExecutionId: `pipeline-operation:${id}`,
  pipelineOrigin: origin
}

it('keeps the host operation identity explicit without fabricating an Assistant or conversation', () => {
  expect(projectPipelineInvocationScopeSchema.parse(scope)).toEqual(scope)
})
it.each([
  { callerXpertId: id },
  { conversationId: id },
  { callerType: 'project_agent' },
  { callerAgentKey: 'general_agent' },
  { parentExecutionId: id },
  { workspaceId: '' },
  { pipelineOrigin: { ...origin, generation: 0 } }
])('rejects widened or malformed Pipeline invocation scope', (patch) => {
  expect(projectPipelineInvocationScopeSchema.safeParse({ ...scope, ...patch }).success).toBe(false)
})
