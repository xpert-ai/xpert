import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
  ChatMessageEventTypeEnum,
  ChatMessageStepCategory,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable,
  TChatMessageStep,
  TProgramToolMessage,
  getToolCallIdFromConfig
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  SANDBOX_SHELL_TIMEOUT_LIMITS_SEC,
  SandboxBackendProtocol,
  SandboxExecutionOptions,
  resolveSandboxBackend,
  secondsToMilliseconds
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const STREAM_THROTTLE_MS = 100

const shellToolSchema = z.object({
  command: z.string().min(1, 'Command is required.'),
  timeout_sec: z
    .number()
    .int()
    .min(
      SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.min,
      `Timeout must be at least ${SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.min} second.`
    )
    .max(
      SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.max,
      `Timeout must be at most ${SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.max} seconds.`
    )
    .optional()
    .describe(
      `Optional command timeout in seconds. Defaults to ${DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC} seconds. Increase this for long-running commands like npm install, pnpm install, cargo build, or test suites. The sandbox terminates the command when the timeout is reached and returns an explicit timeout message.`
    )
})

function assertSandboxFeatureEnabled(context: IAgentMiddlewareContext, middlewareName: string) {
  if (context.xpertFeatures?.sandbox?.enabled === true) {
    return
  }

  throw new Error(`${middlewareName} requires the xpert sandbox feature to be enabled.`)
}

function getToolCallId(config: unknown): string {
  const toolCallId = getToolCallIdFromConfig(config)
  return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : randomUUID()
}

function stringifyToolResult(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (value instanceof Error) {
    return value.message
  }

  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

function createToolMessageStep(
  toolCallId: string,
  toolName: string,
  input: {
    command: string
    timeout_sec?: number
  },
  overrides: Partial<TChatMessageStep<TProgramToolMessage>>
): TChatMessageStep<TProgramToolMessage> {
  return {
    id: toolCallId,
    category: 'Tool',
    type: ChatMessageStepCategory.Program,
    tool: toolName,
    title: toolName,
    input,
    ...overrides
  } as TChatMessageStep<TProgramToolMessage>
}

async function withStreamingToolMessage(
  toolCallId: string,
  toolName: string,
  command: string,
  backend: SandboxBackendProtocol,
  executionOptions?: SandboxExecutionOptions
) {
  const input = {
    command,
    ...(executionOptions?.timeoutMs
      ? {
          timeout_sec: Number((executionOptions.timeoutMs / 1000).toFixed(3))
        }
      : {})
  }

  await dispatchCustomEvent(
    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
    createToolMessageStep(toolCallId, toolName, input, {
      status: 'running',
      created_date: new Date(),
      output: '',
      data: { code: command, output: '' }
    })
  ).catch((error) => {
    console.warn('[ToolMessage] dispatch failed:', error instanceof Error ? error.message : String(error))
  })

  let result
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
            createToolMessageStep(toolCallId, toolName, input, {
              status: 'running',
              output: accumulatedOutput,
              data: { code: command, output: accumulatedOutput }
            })
          ).catch((error) => {
            console.warn('[ToolMessage] dispatch failed:', error instanceof Error ? error.message : String(error))
          })
        }
      },
      executionOptions
    )
  } else {
    result = await backend.execute(command, executionOptions)
  }

  const finalOutput = result.output
  await dispatchCustomEvent(
    ChatMessageEventTypeEnum.ON_TOOL_MESSAGE,
    createToolMessageStep(toolCallId, toolName, input, {
      status: result.exitCode === 0 ? 'success' : 'fail',
      end_date: new Date(),
      output: finalOutput,
      data: { code: command, output: finalOutput },
      error: result.exitCode !== 0 ? finalOutput : undefined
    })
  ).catch((error) => {
    console.warn('[ToolMessage] dispatch failed:', error instanceof Error ? error.message : String(error))
  })

  return result
}

@Injectable()
@AgentMiddlewareStrategy(SANDBOX_SHELL_MIDDLEWARE_NAME)
export class SandboxShellMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: SANDBOX_SHELL_MIDDLEWARE_NAME,
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M20 3V19H19V20H3V19H2V3H3V2H19V3H20M18 6H4V18H18V6M9 9V10H10V11H11V13H10V14H9V15H8V16H6V14H7V13H8V11H7V10H6V8H8V9H9M11 16V14H16V16H11Z"/></svg>`
    },
    label: {
      en_US: 'Sandbox Shell',
      zh_Hans: '沙箱命令行工具'
    },
    description: {
      en_US: 'Adds a shell tool that runs commands via the sandbox backend.',
      zh_Hans: '添加一个通过沙箱后端运行命令的命令行工具。'
    },
    features: ['sandbox'],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(_options: unknown, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    assertSandboxFeatureEnabled(context, SANDBOX_SHELL_MIDDLEWARE_NAME)

    const shellTool = tool(
      async ({ command, timeout_sec }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const backend = resolveSandboxBackend(configurable?.sandbox)

        if (!backend) {
          throw new Error('Sandbox backend is not available for SandboxShell.')
        }

        const timeoutSec = timeout_sec ?? DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC
        const result = await withStreamingToolMessage(
          getToolCallId(config),
          SANDBOX_SHELL_TOOL_NAME,
          command,
          backend,
          {
            timeoutMs: secondsToMilliseconds(timeoutSec)
          }
        )

        if (result.timedOut) {
          return stringifyToolResult(result.output)
        }
        if (result.exitCode !== 0) {
          return `Exit code ${result.exitCode}\n${result.output}`
        }
        return stringifyToolResult(result.output)
      },
      {
        name: SANDBOX_SHELL_TOOL_NAME,
        description: `Execute a shell command in the configured sandbox backend.

Default timeout: ${DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC} seconds.

Use timeout_sec for long-running commands such as npm install, pnpm install, cargo build, pytest, or large test/build jobs. When the timeout is reached, the sandbox terminates the command and returns explicit timeout information.

Do not use this tool to background a long-running server with &, nohup, or disown. Use the SandboxService middleware's sandbox_service_start tool for managed background services so the agent can list, inspect logs, restart, stop, and preview them later.`,
        schema: shellToolSchema
      }
    )

    return {
      name: SANDBOX_SHELL_MIDDLEWARE_NAME,
      tools: [shellTool]
    }
  }
}
