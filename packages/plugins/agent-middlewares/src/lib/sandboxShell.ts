import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  BaseSandbox,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

const shellToolSchema = z.object({
  command: z.string().min(1, 'Command is required.')
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

  createMiddleware(
    _options: unknown,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const shellTool = tool(
      async ({ command }, config) => {
        const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
        const backend = configurable?.sandbox?.backend as BaseSandbox | undefined

        if (!backend || typeof backend.execute !== 'function') {
          throw new Error('Sandbox backend is not available for SandboxShell.')
        }

        return backend.execute(command)
      },
      {
        name: SANDBOX_SHELL_TOOL_NAME,
        description: 'Execute a shell command in the configured sandbox backend.',
        schema: shellToolSchema
      }
    )

    return {
      name: SANDBOX_SHELL_MIDDLEWARE_NAME,
      tools: [shellTool]
    }
  }
}
