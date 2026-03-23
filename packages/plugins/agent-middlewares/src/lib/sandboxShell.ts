import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  BaseSandbox,
  DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC,
  SANDBOX_SHELL_TIMEOUT_LIMITS_SEC,
  secondsToMilliseconds,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { getToolCallId, withStreamingToolMessage } from './toolMessageUtils'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

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
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  createMiddleware(_options: unknown, _context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const shellTool = tool(
      async ({ command, timeout_sec }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const backend = configurable?.sandbox?.backend as BaseSandbox | undefined

        if (!backend || typeof backend.execute !== 'function') {
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
          return result.output
        }
        if (result.exitCode !== 0) {
          return `Exit code ${result.exitCode}\n${result.output}`
        }
        return result.output
      },
      {
        name: SANDBOX_SHELL_TOOL_NAME,
        description: `Execute a shell command in the configured sandbox backend.

Default timeout: ${DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC} seconds.

Use timeout_sec for long-running commands such as npm install, pnpm install, cargo build, pytest, or large test/build jobs. When the timeout is reached, the sandbox terminates the command and returns explicit timeout information.`,
        schema: shellToolSchema
      }
    )

    return {
      name: SANDBOX_SHELL_MIDDLEWARE_NAME,
      tools: [shellTool]
    }
  }
}
