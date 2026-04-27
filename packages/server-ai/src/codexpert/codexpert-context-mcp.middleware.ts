import { tool } from '@langchain/core/tools'
import type { RunnableConfig } from '@langchain/core/runnables'
import { MCPServerType, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable, Logger } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { requireCurrentBusinessPrincipal } from '../shared'
import { createMCPClient } from '../xpert-toolset/provider/mcp/types'

const CODEXPERT_CONTEXT_MCP_MIDDLEWARE_NAME = 'CodexpertContextMcp'
const CODEXPERT_CONTEXT_SERVER_NAME = 'codexpert-context'
const CODEXPERT_MCP_TOOL_INSTRUCTIONS =
  'When using this Codexpert MCP tool for a coding task, be exact and conservative. Use it only after the user intent, target scope, and expected outcome are clear. If the request is ambiguous, incomplete, or has multiple valid interpretations, ask the user to clarify and confirm before using the tool. Do not infer unstated requirements, broaden the requested scope, or reshape the task beyond what the user explicitly asked for.'

type CodexpertContextMcpOptions = {
  url?: string | null
}

@Injectable()
@AgentMiddlewareStrategy(CODEXPERT_CONTEXT_MCP_MIDDLEWARE_NAME)
export class CodexpertContextMcpMiddleware implements IAgentMiddlewareStrategy<CodexpertContextMcpOptions> {
  readonly #logger = new Logger(CodexpertContextMcpMiddleware.name)

  readonly meta: TAgentMiddlewareMeta = {
    name: CODEXPERT_CONTEXT_MCP_MIDDLEWARE_NAME,
    label: {
      en_US: 'Codexpert MCP',
      zh_Hans: 'Codexpert MCP'
    },
    description: {
      en_US:
        'Expose Codexpert context and resume tools through MCP. Use them with precise coding intent; clarify and confirm ambiguous requests first.',
      zh_Hans: '通过 Codexpert MCP 暴露编码上下文和会话恢复工具；使用前必须确保编码意图精确，需求不清时先澄清并确认。'
    },
    configSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          title: {
            en_US: 'MCP URL',
            zh_Hans: 'MCP 地址'
          },
          description: {
            en_US: 'Optional Codexpert MCP endpoint. Defaults to CODEXPERT_MCP_BASE_URL or the /mcp sibling of CODEXPERT_ACP_BASE_URL.',
            zh_Hans: '可选的 Codexpert MCP 端点。默认读取 CODEXPERT_MCP_BASE_URL，或使用 CODEXPERT_ACP_BASE_URL 对应的 /mcp 地址。'
          }
        }
      }
    }
  }

  async createMiddleware(
    options: CodexpertContextMcpOptions,
    _context: IAgentMiddlewareContext
  ): Promise<AgentMiddleware> {
    const tools = await this.createTools(options)
    return {
      name: CODEXPERT_CONTEXT_MCP_MIDDLEWARE_NAME,
      tools
    }
  }

  private async createTools(options: CodexpertContextMcpOptions) {
    const url = resolveCodexpertMcpUrl(options?.url)
    if (!url) {
      throw new Error('Codexpert MCP middleware requires CODEXPERT_MCP_BASE_URL or CODEXPERT_ACP_BASE_URL.')
    }

    const principal = requireCurrentBusinessPrincipal()
    const { client } = await createMCPClient(createMiddlewareToolset(url), createSchema(url), {}, { principal })
    try {
      const upstreamTools = await client.getTools()
      return upstreamTools.map((upstreamTool) =>
        tool(
          async (input: unknown, config?: RunnableConfig) => {
            const runtime = await createMCPClient(createMiddlewareToolset(url), createSchema(url), {}, { principal })
            try {
              const runtimeTools = await runtime.client.getTools()
              const runtimeTool = runtimeTools.find((item) => item.name === upstreamTool.name)
              if (!runtimeTool) {
                throw new Error(`Codexpert MCP tool "${upstreamTool.name}" is not available.`)
              }
              return await runtimeTool.invoke(input as never, config)
            } finally {
              runtime.client.close().catch((err) => this.#logger.debug(err))
            }
          },
          {
            name: upstreamTool.name,
            description: buildCodexpertMcpToolDescription(upstreamTool.description),
            schema: upstreamTool.schema ?? z.object({})
          }
        )
      )
    } finally {
      client.close().catch((err) => this.#logger.debug(err))
    }
  }
}

function buildCodexpertMcpToolDescription(description?: string): string {
  const upstreamDescription = readString(description)
  return upstreamDescription
    ? `${upstreamDescription}\n\n${CODEXPERT_MCP_TOOL_INSTRUCTIONS}`
    : CODEXPERT_MCP_TOOL_INSTRUCTIONS
}

function createMiddlewareToolset(url: string) {
  return {
    id: CODEXPERT_CONTEXT_MCP_MIDDLEWARE_NAME,
    name: 'Codexpert MCP',
    schema: JSON.stringify(createSchema(url))
  }
}

function createSchema(url: string) {
  const token = readEnv('CODEXPERT_MCP_SERVICE_TOKEN') ?? readEnv('CODEXPERT_ACP_SERVICE_TOKEN') ?? readEnv('ACP_SERVICE_TOKEN')
  return {
    mcpServers: {
      [CODEXPERT_CONTEXT_SERVER_NAME]: {
        type: MCPServerType.HTTP,
        url,
        headers: token ? { Authorization: `Bearer ${token}` } : undefined
      }
    }
  }
}

function resolveCodexpertMcpUrl(value?: string | null): string | null {
  const explicit = readString(value) ?? readEnv('CODEXPERT_MCP_BASE_URL') ?? readEnv('CODEXPERT_CONTEXT_MCP_URL')
  if (explicit) {
    return explicit
  }

  const acpUrl = readEnv('CODEXPERT_ACP_BASE_URL') ?? readEnv('XPERT_CODEXPERT_ACP_ENDPOINT')
  if (!acpUrl) {
    return null
  }

  return acpUrl.replace(/\/acp\/?$/, '/mcp')
}

function readEnv(name: string): string | null {
  return readString(process.env[name])
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}
