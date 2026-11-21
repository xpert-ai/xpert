import { randomUUID } from 'node:crypto'
import { AIMessage, HumanMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages'
import { ProjectTasksRuntimeCapability } from '@xpert-ai/plugin-sdk'
import type { ProjectTaskGraph } from '@xpert-ai/contracts'
import { deliveryFixture } from './delivery.fixture'
import { checkStageCoordination } from './stage-coordination'

describe('Coding stage coordination at the end of a model turn', () => {
  let f: Awaited<ReturnType<typeof deliveryFixture>>
  let graph: ProjectTaskGraph
  beforeEach(async () => {
    f = await deliveryFixture()
    await f.operations.prepare(f.context, 'development')
    graph = { projectId: f.projectId, cursor: '', tasks: [], executions: [], diagnostics: [] }
    jest.spyOn(f.capabilities.require(ProjectTasksRuntimeCapability), 'graph').mockResolvedValue(graph)
  })
  afterEach(() => f.db.destroy())

  const run = (messages: BaseMessage[], executor = f.context.executor) =>
    checkStageCoordination(f.store, f.context, executor, messages)
  const end = () => new AIMessage('Historical task operation receipt: the next worker has started.')
  const attempt = (invocationStatus: ProjectTaskGraph['executions'][number]['invocationStatus']) => ({
    id: randomUUID(),
    taskId: randomUUID(),
    projectId: f.projectId,
    attempt: 1,
    status: 'succeeded' as const,
    conversationId: f.context.executor.conversationId,
    invocationId: randomUUID(),
    invocationStatus
  })

  it('gives narrated actions one correction and bounds another unsupported completion', async () => {
    const first = await run([end()])
    expect(first?.jumpTo).toBe('model')
    await expect(run([end(), ...first!.messages, end()])).rejects.toMatchObject({
      response: { code: 'CODING_COORDINATION_ACTION_MISSING' }
    })
  })
  it('waits for a real active delegation in this stage and ignores an unrelated one', async () => {
    const execution = attempt('running')
    graph.executions.push(execution)
    await expect(run([end()])).resolves.toBeUndefined()
    execution.conversationId = randomUUID()
    expect((await run([end()]))?.jumpTo).toBe('model')
  })
  it('verifies a fast terminal dispatch against this turn and the persisted attempt', async () => {
    const execution = attempt('succeeded')
    graph.executions.push(execution)
    const name = 'project_dispatch_task'
    const call = new AIMessage({ content: '', tool_calls: [{ name, id: 'one', args: {} }] })
    const receipt = new ToolMessage({
      name,
      tool_call_id: 'one',
      status: 'success',
      content: JSON.stringify({
        projectId: f.projectId,
        projectTaskId: execution.taskId,
        taskExecutionId: execution.id,
        invocationId: execution.invocationId,
        status: 'queued'
      })
    })
    await expect(run([call, receipt, end()])).resolves.toBeUndefined()
    expect((await run([call, receipt, new HumanMessage('Result received'), end()]))?.jumpTo).toBe('model')
    expect((await run([receipt, end()]))?.jumpTo).toBe('model')
    graph.executions.length = 0
    expect((await run([call, receipt, end()]))?.jumpTo).toBe('model')
  })
  it('surfaces uncertain execution without sending another instruction', async () => {
    graph.executions.push(attempt('unknown'))
    await expect(run([end()])).rejects.toMatchObject({ response: { code: 'CODING_DELEGATION_STATE_UNKNOWN' } })
  })
  it('leaves a stopped pipeline and a non-stage conversation alone', async () => {
    await expect(run([end()], { ...f.context.executor, conversationId: randomUUID() })).resolves.toBeUndefined()
    f.setActive(false)
    await expect(run([end()])).resolves.toBeUndefined()
  })
  it('gives an exact technical retry its prior conversation and leaves the old stage inactive', async () => {
    const retry = {
      ...f.context,
      work: { ...f.context.work, operationId: randomUUID() },
      executor: { ...f.context.executor, conversationId: randomUUID(), executionId: randomUUID() }
    }
    expect((await f.operations.prepare(retry, 'development')).prompt).toContain(f.context.executor.conversationId)
    await expect(run([end()])).resolves.toBeUndefined()
    expect(
      (
        await f.operations.prepare(
          {
            ...retry,
            work: { ...retry.work, generation: 2, operationId: randomUUID() }
          },
          'development'
        )
      ).prompt
    ).not.toContain(f.context.executor.conversationId)
  })
})
