import { AIMessage, isAIMessage, ToolMessage } from '@langchain/core/messages'
import { ToolCall, } from '@langchain/core/messages/tool'
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
  JumpToTarget,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { ClientToolMessageInput, ClientToolRequest, ClientToolResponse } from '@xpert-ai/chatkit-types'
import { z } from 'zod/v3'
import type { JSONSchema4 } from "json-schema";

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
                  zh_Hans: '描述工具参数的 JSON 架构。'
                },
                'x-ui': {
                  component: 'textarea' //'json-schema-editor',
                }
              }
            }
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

    const tools = (options.clientTools || []).map((_) => tool(async (_, config) => {
      return ''
    }, {
      name: _.name,
      description: _.description,
      schema: (_.schema ? JSON.parse(_.schema) : undefined) as JSONSchema4
    }))

    return {
      name: CLIENT_TOOL_MIDDLEWARE_NAME,
      tools,
      afterModel: {
        canJumpTo: ['model'],
        hook: async (state, runtime) => {
          const config = interopParse(contextSchema, {
            ...options,
            ...(runtime.context || {})
          })
          if (!config?.clientTools?.length) {
            return
          }

          const { messages } = state
          if (!messages.length) {
            return
          }

          const lastMessage = [...messages].reverse().find((msg) => isAIMessage(msg)) as AIMessage
          if (!lastMessage || !lastMessage.tool_calls?.length) {
            return
          }

          const clientToolSet = config.clientTools
          const clientToolCalls = lastMessage.tool_calls.filter((toolCall) => clientToolSet.some((ct) => ct.name === toolCall.name))

          if (!clientToolCalls.length) {
            return
          }

          const remainingToolCalls = lastMessage.tool_calls.filter(
            (toolCall) => !clientToolSet.some((ct) => ct.name === toolCall.name)
          )

          const request: ClientToolRequest = {
            clientToolCalls: clientToolCalls
          }

          const response = (await interrupt(request)) as ClientToolResponse
          const toolMessages = response?.toolMessages

          if (!Array.isArray(toolMessages)) {
            throw new Error('Invalid ClientToolResponse: toolMessages must be an array')
          }

          if (toolMessages.length !== clientToolCalls.length) {
            throw new Error(
              `Number of toolMessages (${toolMessages.length}) does not match number of client tool calls (${clientToolCalls.length}).`
            )
          }

          const resolvedToolMessages = toolMessages.map((message, index) =>
            toToolMessage(message, clientToolCalls[index]!)
          )

          lastMessage.tool_calls = remainingToolCalls

          const jumpTo: JumpToTarget | undefined = remainingToolCalls.length ? undefined : 'model'

          return {
            messages: [lastMessage, ...resolvedToolMessages],
            jumpTo
          }
        }
      },
      wrapToolCall: async (request, handler) => {
        const toolName = request.toolCall.name;

        
        const config = interopParse(contextSchema, {
            ...options,
            ...(runtime.context || {})
          })
          if (!config?.clientTools?.length) {
            return
          }

          const { messages } = state
          if (!messages.length) {
            return
          }

          const lastMessage = [...messages].reverse().find((msg) => isAIMessage(msg)) as AIMessage
          if (!lastMessage || !lastMessage.tool_calls?.length) {
            return
          }

          const clientToolSet = config.clientTools
          const clientToolCalls = lastMessage.tool_calls.filter((toolCall) => clientToolSet.some((ct) => ct.name === toolCall.name))

          if (!clientToolCalls.length) {
            return
          }

          const remainingToolCalls = lastMessage.tool_calls.filter(
            (toolCall) => !clientToolSet.some((ct) => ct.name === toolCall.name)
          )

          const request: ClientToolRequest = {
            clientToolCalls: clientToolCalls
          }

          const response = (await interrupt(request)) as ClientToolResponse
          const toolMessages = response?.toolMessages

          if (!Array.isArray(toolMessages)) {
            throw new Error('Invalid ClientToolResponse: toolMessages must be an array')
          }

          if (toolMessages.length !== clientToolCalls.length) {
            throw new Error(
              `Number of toolMessages (${toolMessages.length}) does not match number of client tool calls (${clientToolCalls.length}).`
            )
          }

          const resolvedToolMessages = toolMessages.map((message, index) =>
            toToolMessage(message, clientToolCalls[index]!)
          )

          lastMessage.tool_calls = remainingToolCalls

          const jumpTo: JumpToTarget | undefined = remainingToolCalls.length ? undefined : 'model'

        return {
          messages: [lastMessage, ...resolvedToolMessages],
          jumpTo
        }
      }
    }
  }
}
