import { tool } from '@langchain/core/tools'
import { InferInteropZodInput, interopParse, interopSafeParse } from '@langchain/core/utils/types'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, TAgentMiddlewareMeta, TAgentRunnableConfigurable } from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  JsonSchemaValidator,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'

const contextSchema = z.object({
  /**
   * Client-side effect tool names.
   * These tool calls will emit effect events to the UI client.
   */
  clientEffects: z.array(z.object({
    name: z.string(),
    description: z.string().optional().nullable(),
    schema: z.string().optional().nullable(),
    result: z.string().optional().nullable()
  })).default([])
})
export type ClientEffectMiddlewareConfig = InferInteropZodInput<typeof contextSchema>

const CLIENT_EFFECT_MIDDLEWARE_NAME = 'ClientEffectMiddleware'
const CLIENT_EFFECT_EVENT = 'on_client_effect' as ChatMessageEventTypeEnum

function parseEffectResult(result?: string) {
  if (!result) {
    return ''
  }

  const trimmed = result.trim()
  if (!trimmed) {
    return ''
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return result
  }
}

@Injectable()
@AgentMiddlewareStrategy(CLIENT_EFFECT_MIDDLEWARE_NAME)
export class ClientEffectMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: CLIENT_EFFECT_MIDDLEWARE_NAME,
    label: {
      en_US: 'Client Effect Middleware',
      zh_Hans: '客户端副作用中间件'
    },
    description: {
      en_US: 'Emits tool call events to the UI client without interrupts and returns configured results.',
      zh_Hans: '工具被调用时向客户端发送事件，不中断执行并返回配置结果。'
    },
    icon: {
      type: 'svg',
      value: `<?xml version="1.0" encoding="utf-8"?>
<svg fill="currentColor" xmlns="http://www.w3.org/2000/svg" 
	 width="800px" height="800px" viewBox="0 0 100 100" enable-background="new 0 0 100 100" xml:space="preserve">
<g>
	<g>
		<path d="M48.3,74.5c1,0,1.8-0.8,1.8-1.8l0.1-20.8c0.1-1-0.8-1.8-1.6-1.9l-0.3,0l-20.9,0c-1-0.1-1.8,0.8-1.9,1.6
			v0.3v3.8c-0.1,1,0.8,1.8,1.6,1.9h0.3h6.6c0.7,0,1.3,0.6,1.3,1.3c0,0.3-0.1,0.7-0.3,0.9l-14,14c-0.8,0.8-0.8,2.1-0.1,2.8l2.7,2.7
			c0.8,0.7,2,0.6,2.8-0.1l14.1-14.1c0.5-0.5,1.3-0.5,1.8,0c0.2,0.2,0.4,0.5,0.3,0.9v6.6c-0.1,1,0.8,1.8,1.6,1.9h0.3L48.3,74.5z"/>
	</g>
	<path d="M55.7,77.7c5.7-1,11.2-3.7,15.6-8c11.3-11.3,11.3-29.7,0-41s-29.7-11.3-41,0c-4.4,4.4-7,9.8-8,15.5l5.9,0
		c0.9-4.2,3-8.1,6.2-11.4c9-9,23.8-9,32.8,0s9,23.8,0,32.8c-3.2,3.2-7.2,5.3-11.3,6.2L55.7,77.7z M56,65.8c2.6-0.8,5.1-2.2,7.1-4.3
		c6.8-6.8,6.8-17.8,0-24.6s-17.8-6.8-24.6,0c-2.1,2.1-3.5,4.6-4.3,7.2l6.2,0c0.5-1.2,1.3-2.2,2.2-3.2c4.5-4.5,11.9-4.5,16.4,0
		s4.5,11.9,0,16.4c-0.9,0.9-1.9,1.6-3,2.2L56,65.8z"/>
</g>
</svg>`,
      color: 'blue'
    },
    configSchema: {
      type: 'object',
      properties: {
        clientEffects: {
          type: 'array',
          title: {
            en_US: 'Client Effects',
            zh_Hans: '客户端效果'
          },
          description: {
            en_US: 'Tool names that should emit effect events on the UI client.',
            zh_Hans: '需要在 UI 客户端触发效果事件的工具名称。'
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
                  en_US: 'The name of the tool to emit effect events for.',
                  zh_Hans: '将在客户端触发效果事件的工具名称。'
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
                  component: 'code-editor', //'json-schema-editor',
                  inputs: {
                    language: 'json',
                    editable: true,
                    lineNumbers: true
                  },
                  styles: {
                    'min-height': '150px'
                  },
                  help: 'https://json-schema.org/learn/getting-started-step-by-step'
                }
              },
              result: {
                type: 'string',
                title: {
                  en_US: 'Result',
                  zh_Hans: '返回结果'
                },
                description: {
                  en_US: 'Static result returned to the model (JSON or text).',
                  zh_Hans: '返回给模型的静态结果（JSON 或文本）。'
                },
                'x-ui': {
                  component: 'textarea',
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
    options: NonNullable<ClientEffectMiddlewareConfig>,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    const {data, error } = interopSafeParse(contextSchema, options)
    if (error) {
      throw new Error(`ClientEffectMiddleware configuration error: ${error.message}`)
    }
    const tools = (data?.clientEffects || []).map((effect) => {
      const schema = new JsonSchemaValidator().parseAndValidate(effect.schema)
      const parsedResult = parseEffectResult(effect.result)
      return tool(async (_input) => {
        return parsedResult
      }, {
        name: effect.name,
        description: effect.description,
        schema: schema
      })
    })

    return {
      name: CLIENT_EFFECT_MIDDLEWARE_NAME,
      tools,
      wrapToolCall: async (request, handler) => {
        const config = interopParse(contextSchema, {
          ...options,
          // ...(request.runtime.context || {})
        })
        if (!config?.clientEffects?.length) {
          return handler(request)
        }

        const effect = config.clientEffects.find(
          (clientEffect) => clientEffect.name === request.toolCall.name
        )
        if (!effect) {
          return handler(request)
        }

        const configurable = request.runtime.configurable as TAgentRunnableConfigurable
        const { subscriber, executionId, agentKey, xpertName } = configurable ?? {}
        subscriber?.next({
          data: {
            type: ChatMessageTypeEnum.EVENT,
            event: CLIENT_EFFECT_EVENT,
            data: {
              toolCall: request.toolCall,
              name: request.toolCall.name,
              args: request.toolCall.args,
              tool_call_id: request.toolCall.id,
              executionId,
              agentKey,
              xpertName,
              created_date: new Date()
            }
          }
        } as MessageEvent)

        return handler(request)
      }
    }
  }
}
