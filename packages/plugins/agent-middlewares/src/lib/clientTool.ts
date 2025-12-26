import { z } from 'zod/v3'
import { ToolMessage } from '@langchain/core/messages'
import { ToolCall } from '@langchain/core/messages/tool'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import { tool } from '@langchain/core/tools'
import { interrupt } from '@langchain/langgraph'
import { TAgentMiddlewareMeta } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  JsonSchemaValidator,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { ClientToolMessageInput, ClientToolRequest, ClientToolResponse } from '@xpert-ai/chatkit-types'

const contextSchema = z.object({
  /**
   * Client-side tool names.
   * These tool calls will be interrupted and executed on the UI client.
   */
  clientTools: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    schema: z.string().optional()
  })).default([])
})
export type ClientToolMiddlewareConfig = InferInteropZodInput<typeof contextSchema>

const CLIENT_TOOL_MIDDLEWARE_NAME = 'ClientToolMiddleware'

@Injectable()
@AgentMiddlewareStrategy(CLIENT_TOOL_MIDDLEWARE_NAME)
export class ClientToolMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: CLIENT_TOOL_MIDDLEWARE_NAME,
    label: {
      en_US: 'Client Tool Middleware',
      zh_Hans: '客户端工具中间件'
    },
    description: {
      en_US: 'Routes selected tool calls to the UI client via HITL interrupts and resumes with tool results.',
      zh_Hans: '将选定的工具调用通过 HITL 中断交给客户端执行，并在收到结果后继续对话。'
    },
    icon: {
      type: 'svg',
      value: `<?xml version="1.0" encoding="utf-8"?>
<svg width="800px" height="800px" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M16 7H8C5.79086 7 4 8.79086 4 11V17C4 19.2091 5.79086 21 8 21H16C18.2091 21 20 19.2091 20 17V11C20 8.79086 18.2091 7 16 7Z" stroke="currentColor" stroke-width="1.5"/>
<path d="M9 3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M15 3V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 12L15 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
<path d="M12 12L9 15" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
</svg>`,
      color: 'blue'
    },
    configSchema: {
      type: 'object',
      properties: {
        clientTools: {
          type: 'array',
          title: {
            en_US: 'Client Tools',
            zh_Hans: '客户端工具'
          },
          description: {
            en_US: 'Tool names that should run on the UI client.',
            zh_Hans: '需要在 UI 客户端运行的工具名称。'
          },
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                title: {
                  en_US: 'Tool Name',
                  zh_Hans: '工具名称'
                },
                description: {
                  en_US: 'The name of the tool to be executed on the client side.',
                  zh_Hans: '将在客户端执行的工具名称。'
                }
              },
              description: {
                type: 'string',
                title: {
                  en_US: 'Description',
                  zh_Hans: '描述'
                },
                description: {
                  en_US: 'A brief description of the tool.',
                  zh_Hans: '工具的简要描述。'
                },
                'x-ui': {
                  component: 'textarea',
                }
              },
              schema: {
                type: 'string',
                title: {
                  en_US: 'Arguments Schema',
                  zh_Hans: '参数架构'
                },
                description: {
                  en_US: 'JSON schema describing the tool arguments.',
                  zh_Hans: '描述工具参数的 JSON Schema。'
                },
                'x-ui': {
                  component: 'code-editor', //'json-schema-editor',
                  inputs: {
                    language: 'json',
                    editable: true,
                    lineNumbers: true
                  },
                  help: 'https://json-schema.org/learn/getting-started-step-by-step'
                }
              }
            },
            required: ['name']
          },
          'x-ui': {
            span: 2
          }
        }
      }
    } as TAgentMiddlewareMeta['configSchema']
  }

  createMiddleware(
    options: NonNullable<ClientToolMiddlewareConfig>,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const toToolMessage = (
      message: ClientToolMessageInput | ToolMessage,
      toolCall: ToolCall
    ): ToolMessage => {
      if (message instanceof ToolMessage) {
        return message
      }

      const toolCallId = message.tool_call_id ?? toolCall.id
      if (!toolCallId) {
        throw new Error(
          `Missing tool_call_id for client tool "${toolCall.name}". Provide tool_call_id in the response or ensure the tool call has an id.`
        )
      }

      let content: string
      if (typeof message.content === 'string') {
        content = message.content
      } else if (message.content == null) {
        content = ''
      } else {
        content = JSON.stringify(message.content)
      }

      return new ToolMessage({
        content,
        name: message.name ?? toolCall.name,
        tool_call_id: toolCallId,
        status: message.status,
        artifact: message.artifact
      })
    }

    const tools = (options.clientTools || []).filter((_) => !!_).map((_) => {
      const schema = new JsonSchemaValidator().parseAndValidate(_.schema)
      return tool(async (_, config) => {
          return ''
        }, {
          name: _.name,
          description: _.description,
          schema: schema
        })
    })

    return {
      name: CLIENT_TOOL_MIDDLEWARE_NAME,
      tools,
      wrapToolCall: async (request, handler) => {
        const config = interopParse(contextSchema, {
          ...options,
          // ...(request.runtime.context || {})
        })
        if (!config?.clientTools?.length) {
          return handler(request)
        }

        const isClientTool = config.clientTools.some(
          (clientTool) => clientTool.name === request.toolCall.name
        )
        if (!isClientTool) {
          return handler(request)
        }

        const clientRequest: ClientToolRequest = {
          clientToolCalls: [request.toolCall]
        }

        const response = (await interrupt(clientRequest)) as ClientToolResponse
        const toolMessages = response?.toolMessages

        if (!Array.isArray(toolMessages) || toolMessages.length !== 1) {
          throw new Error(
            'Invalid ClientToolResponse: toolMessages must be an array with exactly one item'
          )
        }

        const message = toolMessages[0]
        if (
          message?.tool_call_id &&
          request.toolCall.id &&
          message.tool_call_id !== request.toolCall.id
        ) {
          throw new Error(
            `Invalid ClientToolResponse: tool_call_id "${message.tool_call_id}" does not match "${request.toolCall.id}".`
          )
        }

        return toToolMessage(message, request.toolCall)
      }
    }
  }
}
