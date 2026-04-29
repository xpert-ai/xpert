import { tool } from '@langchain/core/tools'
import {
  SandboxManagedServiceErrorCode,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { SandboxGetManagedServiceLogsCommand } from '../commands/get-managed-service-logs.command'
import { SandboxListManagedServicesCommand } from '../commands/list-managed-services.command'
import { SandboxRestartManagedServiceCommand } from '../commands/restart-managed-service.command'
import { SandboxStartManagedServiceCommand } from '../commands/start-managed-service.command'
import { SandboxStopManagedServiceCommand } from '../commands/stop-managed-service.command'

const SANDBOX_SERVICE_MIDDLEWARE_NAME = 'SandboxService'
const SANDBOX_SERVICE_START_TOOL_NAME = 'sandbox_service_start'
const SANDBOX_SERVICE_LIST_TOOL_NAME = 'sandbox_service_list'
const SANDBOX_SERVICE_LOGS_TOOL_NAME = 'sandbox_service_logs'
const SANDBOX_SERVICE_STOP_TOOL_NAME = 'sandbox_service_stop'
const SANDBOX_SERVICE_RESTART_TOOL_NAME = 'sandbox_service_restart'

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

function assertSandboxFeatureEnabled(context: IAgentMiddlewareContext, middlewareName: string) {
  if (context.xpertFeatures?.sandbox?.enabled === true) {
    return
  }

  throw new Error(`${middlewareName} requires the xpert sandbox feature to be enabled.`)
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
@AgentMiddlewareStrategy(SANDBOX_SERVICE_MIDDLEWARE_NAME)
export class SandboxServiceMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly commandBus: CommandBus) {}

  meta: TAgentMiddlewareMeta = {
    name: SANDBOX_SERVICE_MIDDLEWARE_NAME,
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M4 4H18V8H16V6H6V16H16V14H18V18H4V4M9 8H13V10H15V12H13V14H9V12H12V10H9V8Z"/></svg>`
    },
    label: {
      en_US: 'Sandbox Service',
      zh_Hans: '沙箱服务'
    },
    description: {
      en_US: 'Adds tools for managing long-running sandbox services.',
      zh_Hans: '添加用于管理长运行沙箱服务的工具。'
    },
    features: ['sandbox'],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(_options: unknown, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    assertSandboxFeatureEnabled(context, SANDBOX_SERVICE_MIDDLEWARE_NAME)

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
      name: SANDBOX_SERVICE_MIDDLEWARE_NAME,
      tools: [serviceStartTool, serviceListTool, serviceLogsTool, serviceStopTool, serviceRestartTool]
    }
  }
}
