import { ConflictException } from '@nestjs/common'
import { HumanMessage, isAIMessage, isToolMessage, type BaseMessage } from '@langchain/core/messages'
import { projectTaskDispatchReceiptSchema, type ProjectTaskGraph } from '@xpert-ai/contracts'
import {
  ProjectTasksRuntimeCapability,
  type IAgentMiddlewareContext,
  type ProjectPipelineContext
} from '@xpert-ai/plugin-sdk'
import { CodingDeliveryStore, conflict } from './store'

/** Called only at a proposed stage turn boundary. The model chooses the next action.
 * A narration, a manual task status, or another conversation's invocation cannot supply a wake. */
export async function checkStageCoordination(
  store: CodingDeliveryStore,
  scope: ProjectPipelineContext,
  context: Pick<IAgentMiddlewareContext, 'executionId' | 'xpertId' | 'conversationId'>,
  messages: BaseMessage[]
) {
  const response = messages.at(-1)
  if (
    !response ||
    !isAIMessage(response) ||
    response.tool_calls?.length ||
    !context.executionId ||
    !context.conversationId
  )
    return
  const stage = await store.stageForConversation(scope, context.conversationId)
  if (
    !stage ||
    stage.evidence ||
    stage.context.executor.xpertId !== context.xpertId ||
    (stage.context.executor.userId ?? stage.context.actor.userId) !== scope.actor.userId
  )
    return
  const [latest] = await store.stageAttempts(stage.context, stage.deliveryId, stage.phase, stage.requirementVersion)
  if (latest?.work.operationId !== stage.id) return
  try {
    await store.assertActive(stage, 'submit', scope)
  } catch (error) {
    if (error instanceof ConflictException) {
      const detail = error.getResponse()
      if (
        typeof detail === 'object' &&
        'code' in detail &&
        (detail.code === 'CODING_REQUIREMENT_SUPERSEDED' || detail.code === 'CODING_OPERATION_NOT_ACTIVE')
      )
        return
    }
    throw error
  }
  const graph = await store.capabilities.require(ProjectTasksRuntimeCapability).graph(scope)
  const attempts = graph.executions.filter(
    (entry) => entry.conversationId === context.conversationId && entry.invocationId
  )
  if (
    attempts.some(
      (entry) =>
        entry.dispatchState === 'pending' ||
        ['queued', 'running', 'waiting', 'cancelling'].includes(entry.invocationStatus ?? '')
    )
  )
    return
  if (attempts.some((entry) => entry.invocationStatus === 'unknown' || !entry.invocationStatus))
    throw conflict('CODING_DELEGATION_STATE_UNKNOWN')
  if (hasNewDispatchReceipt(messages, attempts)) return
  const taskIds = new Set(attempts.map((entry) => entry.taskId))
  const tasks = graph.tasks.filter((entry) => taskIds.has(entry.id))
  if (tasks.length && tasks.every((entry) => ['blocked', 'paused', 'cancelled'].includes(entry.status))) return

  const marker = 'stage-check-' + context.executionId
  if (messages.some((message) => message.id === marker)) throw conflict('CODING_COORDINATION_ACTION_MISSING')
  return {
    messages: [
      new HumanMessage({
        id: marker,
        name: 'stage_coordination',
        content:
          'The host checked this stage: no submitted delivery or outstanding delegated execution was found. Read current project task state. Take the appropriate next action with its tool, or record and report the concrete blocker. A reply announcing a dispatch cannot create it.'
      })
    ],
    jumpTo: 'model' as const
  }
}

// An immediate terminal result also has a durable return to its caller. Match a real tool
// exchange from this turn to its persisted attempt, even if the child finished before the read.
function hasNewDispatchReceipt(messages: BaseMessage[], attempts: ProjectTaskGraph['executions']) {
  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index]
    if (message.getType() === 'human') break
    if (
      !isToolMessage(message) ||
      message.name !== 'project_dispatch_task' ||
      message.status !== 'success' ||
      typeof message.content !== 'string'
    )
      continue
    let previous = index - 1
    while (previous >= 0 && isToolMessage(messages[previous])) previous--
    const call = messages[previous]
    if (
      !call ||
      !isAIMessage(call) ||
      !call.tool_calls?.some((request) => request.id === message.tool_call_id && request.name === message.name)
    )
      continue
    try {
      const receipt = projectTaskDispatchReceiptSchema.safeParse(JSON.parse(message.content))
      if (
        receipt.success &&
        attempts.some(
          (entry) =>
            entry.id === receipt.data.taskExecutionId &&
            entry.taskId === receipt.data.projectTaskId &&
            entry.invocationId === receipt.data.invocationId
        )
      )
        return true
    } catch {
      // A non-JSON reply cannot establish dispatch.
    }
  }
  return false
}
