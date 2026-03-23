import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  TChatMessageStep,
  TProgramToolMessage
} from '@metad/contracts'
import { BaseSandbox, ExecuteResponse, SandboxExecutionOptions } from '@xpert-ai/plugin-sdk'
import ShortUniqueId from 'short-unique-id'

const uid = new ShortUniqueId({ length: 10 })

export function shortuuid(): string {
  return uid.randomUUID()
}

export function getToolCallId(config: any): string {
  return (config?.metadata as Record<string, string>)?.['tool_call_id'] ?? shortuuid()
}

/**
 * Wrap a simple (non-streaming) tool invocation with running / success / fail
 * events dispatched to the frontend via LangChain custom events.
 */
export async function withToolMessage<T>(
  toolCallId: string,
  toolName: string,
  title: string,
  input: unknown,
  fn: () => Promise<T>
): Promise<T> {
  await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
    id: toolCallId,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    tool: toolName,
    title: title || toolName,
    status: 'running',
    created_date: new Date(),
    input
  } as TChatMessageStep).catch((e) => {
    console.warn('[ToolMessage] dispatch failed:', e?.message)
  })

  try {
    const result = await fn()
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
      id: toolCallId,
      category: 'Tool',
      type: ChatMessageStepCategory.Program,
      tool: toolName,
      title: title || toolName,
      status: 'success',
      end_date: new Date(),
      output: typeof result === 'string' ? result : JSON.stringify(result)
    } as TChatMessageStep).catch((e) => {
      console.warn('[ToolMessage] dispatch failed:', e?.message)
    })
    return result
  } catch (err: any) {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
      id: toolCallId,
      category: 'Tool',
      type: ChatMessageStepCategory.Program,
      tool: toolName,
      title: title || toolName,
      status: 'fail',
      end_date: new Date(),
      error: err.message
    } as TChatMessageStep).catch((e) => {
      console.warn('[ToolMessage] dispatch failed:', e?.message)
    })
    throw err
  }
}

const STREAM_THROTTLE_MS = 100

/**
 * Execute a sandbox shell command with streaming line-by-line output.
 *
 * Dispatches three phases of events:
 *  1. `running`  – immediately, before execution starts
 *  2. `running`  – on each output line (throttled to avoid dispatch storms)
 *  3. `success` / `fail` – when the command finishes
 *
 * The streaming updates are throttled so that at most one event is sent
 * per `STREAM_THROTTLE_MS` milliseconds.  A final flush is guaranteed
 * in the completion event which always carries `result.output`.
 */
export async function withStreamingToolMessage(
  toolCallId: string,
  toolName: string,
  command: string,
  backend: BaseSandbox,
  executionOptions?: SandboxExecutionOptions
): Promise<ExecuteResponse> {
  const input = {
    command,
    ...(executionOptions?.timeoutMs
      ? {
          timeout_sec: Number((executionOptions.timeoutMs / 1000).toFixed(3))
        }
      : {})
  }

  const makeStep = (overrides: Partial<TChatMessageStep<TProgramToolMessage>>): TChatMessageStep<TProgramToolMessage> =>
    ({
      id: toolCallId,
      category: 'Tool',
      type: ChatMessageStepCategory.Program,
      tool: toolName,
      title: toolName,
      input,
      ...overrides
    }) as TChatMessageStep<TProgramToolMessage>

  // Phase 1: running
  await dispatchCustomEvent(
    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
    makeStep({
      status: 'running',
      created_date: new Date(),
      output: '',
      data: { code: command, output: '' }
    })
  ).catch((e) => {
    console.warn('[ToolMessage] dispatch failed:', e?.message)
  })

  // Phase 2: streaming execution
  let result: ExecuteResponse
  if (typeof backend.streamExecute === 'function') {
    let accumulatedOutput = ''
    let lastDispatchTime = 0

    result = await backend.streamExecute(
      command,
      (line) => {
        accumulatedOutput += (accumulatedOutput ? '\n' : '') + line
        const now = Date.now()
        if (now - lastDispatchTime >= STREAM_THROTTLE_MS) {
          lastDispatchTime = now
          dispatchCustomEvent(
            ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
            makeStep({
              status: 'running',
              output: accumulatedOutput,
              data: { code: command, output: accumulatedOutput }
            })
          ).catch((e) => {
            console.warn('[ToolMessage] dispatch failed:', e?.message)
          })
        }
      },
      executionOptions
    )
  } else {
    result = await backend.execute(command, executionOptions)
  }

  // Phase 3: completion
  const finalOutput = result.output
  await dispatchCustomEvent(
    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
    makeStep({
      status: result.exitCode === 0 ? 'success' : 'fail',
      end_date: new Date(),
      output: finalOutput,
      data: { code: command, output: finalOutput },
      error: result.exitCode !== 0 ? finalOutput : undefined
    })
  ).catch((e) => {
    console.warn('[ToolMessage] dispatch failed:', e?.message)
  })

  return result
}
