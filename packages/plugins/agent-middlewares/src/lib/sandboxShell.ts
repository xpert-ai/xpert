import { tool } from '@langchain/core/tools'
import { SandboxManagedServiceErrorCode, TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { CommandBus } from '@nestjs/cqrs'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC,
  SANDBOX_SHELL_TIMEOUT_LIMITS_SEC,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  resolveSandboxBackend,
  secondsToMilliseconds
} from '@xpert-ai/plugin-sdk'
import {
  SandboxGetManagedServiceLogsCommand,
  SandboxListManagedServicesCommand,
  SandboxRestartManagedServiceCommand,
  SandboxStartManagedServiceCommand,
  SandboxStopManagedServiceCommand
} from '@xpert-ai/server-ai'
import { z } from 'zod/v3'
import { getToolCallId, withStreamingToolMessage } from './toolMessageUtils'
import { assertSandboxFeatureEnabled } from './xpertFeatureGate'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'
const SANDBOX_SERVICE_START_TOOL_NAME = 'sandbox_service_start'
const SANDBOX_SERVICE_LIST_TOOL_NAME = 'sandbox_service_list'
const SANDBOX_SERVICE_LOGS_TOOL_NAME = 'sandbox_service_logs'
const SANDBOX_SERVICE_STOP_TOOL_NAME = 'sandbox_service_stop'
const SANDBOX_SERVICE_RESTART_TOOL_NAME = 'sandbox_service_restart'

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

const serviceStartToolSchema = z.object({
  command: z.string().min(1, 'Command is required.'),
  cwd: z.string().min(1).optional(),
  env: z.record(z.string()).optional(),
  name: z.string().min(1, 'Service name is required.'),
  port: z.number().int().positive().optional(),
  previewPath: z.string().min(1).optional(),
  readyPattern: z.string().min(1).optional(),
  replaceExisting: z.boolean().optional()
})

const serviceListToolSchema = z.object({})

const serviceLogsToolSchema = z.object({
  serviceId: z.string().min(1, 'Service id is required.'),
  tail: z.number().int().min(1).max(1000).optional()
})

const serviceActionToolSchema = z.object({
  serviceId: z.string().min(1, 'Service id is required.')
})

type ManagedServiceToolError = {
  code: string
  message: string
}

function isObjectLike(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function normalizeManagedServiceError(error: unknown): ManagedServiceToolError {
  if (isObjectLike(error) && 'code' in error && typeof error.code === 'string' && 'message' in error) {
    const message = typeof error.message === 'string' ? error.message : 'Sandbox managed service request failed.'
    return {
      code: error.code,
      message
    }
  }

  return {
    code: SandboxManagedServiceErrorCode.ProviderUnavailable,
    message: error instanceof Error ? error.message : String(error)
  }
}

function normalizeEnvEntries(env: Record<string, string> | undefined) {
  return Object.entries(env ?? {}).map(([name, value]) => ({ name, value }))
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

@Injectable()
@AgentMiddlewareStrategy(SANDBOX_SHELL_MIDDLEWARE_NAME)
export class SandboxShellMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly commandBus: CommandBus) {}

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

Do not use this tool to background a long-running server with &, nohup, or disown. Use sandbox_service_start for managed background services so the agent can list, inspect logs, restart, stop, and preview them later.`,
        schema: shellToolSchema
      }
    )

    const serviceStartTool = tool(
      async ({ command, cwd, env, name, port, previewPath, readyPattern, replaceExisting }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const threadId = configurable?.thread_id?.trim()
        if (!threadId) {
          return stringifyToolResult({
            code: SandboxManagedServiceErrorCode.ConversationRequired,
            message: 'Thread context is required to start a sandbox service.'
          })
        }

        try {
          return stringifyToolResult(
            await this.commandBus.execute(
              new SandboxStartManagedServiceCommand({
                agentKey: configurable?.rootAgentKey ?? configurable?.agentKey ?? null,
                executionId: configurable?.rootExecutionId ?? configurable?.executionId ?? null,
                input: {
                  command,
                  ...(cwd ? { cwd } : {}),
                  ...(env ? { env: normalizeEnvEntries(env) } : {}),
                  name,
                  ...(port ? { port } : {}),
                  ...(previewPath ? { previewPath } : {}),
                  ...(readyPattern ? { readyPattern } : {}),
                  ...(replaceExisting ? { replaceExisting } : {})
                },
                threadId
              })
            )
          )
        } catch (error) {
          return stringifyToolResult(normalizeManagedServiceError(error))
        }
      },
      {
        name: SANDBOX_SERVICE_START_TOOL_NAME,
        description:
          'Start a managed background service inside the sandbox workspace. Use this for dev servers, static sites, APIs, and any long-running process that the agent may need to stop, restart, inspect, or preview later.',
        schema: serviceStartToolSchema
      }
    )

    const serviceListTool = tool(
      async (_input, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const threadId = configurable?.thread_id?.trim()
        if (!threadId) {
          return stringifyToolResult({
            code: SandboxManagedServiceErrorCode.ConversationRequired,
            message: 'Thread context is required to list sandbox services.'
          })
        }

        try {
          return stringifyToolResult(
            await this.commandBus.execute(
              new SandboxListManagedServicesCommand({
                threadId
              })
            )
          )
        } catch (error) {
          return stringifyToolResult(normalizeManagedServiceError(error))
        }
      },
      {
        name: SANDBOX_SERVICE_LIST_TOOL_NAME,
        description: 'List managed sandbox services started in the current conversation thread.',
        schema: serviceListToolSchema
      }
    )

    const serviceLogsTool = tool(
      async ({ serviceId, tail }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const threadId = configurable?.thread_id?.trim()
        if (!threadId) {
          return stringifyToolResult({
            code: SandboxManagedServiceErrorCode.ConversationRequired,
            message: 'Thread context is required to read sandbox service logs.'
          })
        }

        try {
          return stringifyToolResult(
            await this.commandBus.execute(
              new SandboxGetManagedServiceLogsCommand({
                serviceId,
                ...(tail ? { tail } : {}),
                threadId
              })
            )
          )
        } catch (error) {
          return stringifyToolResult(normalizeManagedServiceError(error))
        }
      },
      {
        name: SANDBOX_SERVICE_LOGS_TOOL_NAME,
        description: 'Read recent stdout and stderr log tails for a managed sandbox service.',
        schema: serviceLogsToolSchema
      }
    )

    const serviceStopTool = tool(
      async ({ serviceId }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const threadId = configurable?.thread_id?.trim()
        if (!threadId) {
          return stringifyToolResult({
            code: SandboxManagedServiceErrorCode.ConversationRequired,
            message: 'Thread context is required to stop a sandbox service.'
          })
        }

        try {
          return stringifyToolResult(
            await this.commandBus.execute(
              new SandboxStopManagedServiceCommand({
                serviceId,
                threadId
              })
            )
          )
        } catch (error) {
          return stringifyToolResult(normalizeManagedServiceError(error))
        }
      },
      {
        name: SANDBOX_SERVICE_STOP_TOOL_NAME,
        description: 'Stop a managed sandbox service by serviceId.',
        schema: serviceActionToolSchema
      }
    )

    const serviceRestartTool = tool(
      async ({ serviceId }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const threadId = configurable?.thread_id?.trim()
        if (!threadId) {
          return stringifyToolResult({
            code: SandboxManagedServiceErrorCode.ConversationRequired,
            message: 'Thread context is required to restart a sandbox service.'
          })
        }

        try {
          return stringifyToolResult(
            await this.commandBus.execute(
              new SandboxRestartManagedServiceCommand({
                serviceId,
                threadId
              })
            )
          )
        } catch (error) {
          return stringifyToolResult(normalizeManagedServiceError(error))
        }
      },
      {
        name: SANDBOX_SERVICE_RESTART_TOOL_NAME,
        description: 'Restart a managed sandbox service by serviceId using its stored command and launch settings.',
        schema: serviceActionToolSchema
      }
    )

    return {
      name: SANDBOX_SHELL_MIDDLEWARE_NAME,
      tools: [shellTool, serviceStartTool, serviceListTool, serviceLogsTool, serviceStopTool, serviceRestartTool]
    }
  }
}
