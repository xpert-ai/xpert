import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { BaseMessage, SystemMessage, mapChatMessagesToStoredMessages } from '@langchain/core/messages'
import { InferInteropZodInput, interopSafeParse } from '@langchain/core/utils/types'
import {
  AiModelTypeEnum,
  ChatMessageEventTypeEnum,
  ICopilotModel,
  JSONValue,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable,
  TChatEventMessage,
  WorkflowNodeTypeEnum
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  CreateModelClientCommand,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  JsonSchemaValidator,
  WrapWorkflowNodeExecutionCommand
} from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'
import { z } from 'zod/v3'
import { z as z4 } from 'zod/v4'

const DEFAULT_PROMPT = `You are given the full conversation history. Produce a JSON object that strictly matches the provided schema. Return only valid JSON without extra text.`
const DEFAULT_EVENT_TYPE = 'structured_output'
const DEFAULT_EVENT_TITLE = 'Structured Output'
const DEFAULT_OUTPUT_METHOD = 'jsonSchema'

type StructuredOutputRuntimeContext = {
  prompt?: string
  outputSchema?: string
  outputMethod?: string
  eventType?: string
  eventTitle?: string
}

const contextSchema = z.object({
  model: z.custom<ICopilotModel>(),
  prompt: z.string().optional().nullable(),
  outputSchema: z.string().optional().nullable(),
  outputMethod: z.string().optional().nullable(),
  eventType: z.string().optional().nullable(),
  eventTitle: z.string().optional().nullable()
})
export type StructuredOutputMiddlewareConfig = InferInteropZodInput<typeof contextSchema>

const STRUCTURED_OUTPUT_MIDDLEWARE_NAME = 'StructuredOutputMiddleware'

@Injectable()
@AgentMiddlewareStrategy(STRUCTURED_OUTPUT_MIDDLEWARE_NAME)
export class StructuredOutputMiddleware implements IAgentMiddlewareStrategy {
  constructor(private readonly commandBus: CommandBus) {}

  meta: TAgentMiddlewareMeta = {
    name: STRUCTURED_OUTPUT_MIDDLEWARE_NAME,
    label: {
      en_US: 'Structured Output Event Middleware',
      zh_Hans: '结构化输出事件中间件'
    },
    description: {
      en_US: 'Generates structured output from the current conversation and emits it as a chat event.',
      zh_Hans: '基于当前对话生成结构化输出，并通过聊天事件发送给客户端。'
    },
    icon: {
      type: 'svg',
      value: `<svg xmlns="http://www.w3.org/2000/svg" fill-rule="evenodd" clip-rule="evenodd" viewBox="0 0 398 512.188"><path fill-rule="nonzero" d="M59.904 0H277.45a9.13 9.13 0 017.303 3.641l110.781 119.851a9.069 9.069 0 012.419 6.179H398v322.613c0 16.401-6.783 31.384-17.651 42.253-10.87 10.87-25.855 17.651-42.255 17.651H59.904c-16.421 0-31.422-6.756-42.294-17.628C6.763 483.714 0 468.75 0 452.284V59.906C0 43.422 6.739 28.44 17.59 17.59 28.44 6.739 43.42 0 59.904 0zM18.289 339.085h361.422V147.794c-30.513 0-71.711 4.559-96.489-16.605-12.663-10.821-19.766-26.266-21.174-45.471a9.129 9.129 0 01-.086-1.254V18.289H59.904c-11.435 0-21.839 4.686-29.384 12.231-7.545 7.544-12.231 17.949-12.231 29.386v279.179zm361.422 18.495H18.289v94.704c0 11.413 4.705 21.802 12.251 29.347 7.566 7.566 17.984 12.268 29.364 12.268h278.19c11.355 0 21.757-4.723 29.325-12.292 7.569-7.569 12.292-17.969 12.292-29.323V357.58zm-70.08-83.755l-19.111-27.728c-.665-.916-1.082-2.914-1.248-5.995h-.499v33.723h-24.979v-78.06h23.48l19.108 27.727c.666.916 1.083 2.915 1.25 5.995h.5v-33.722h24.978v78.06h-23.479zm-128.269-38.967c0-14.239 2.664-24.625 7.993-31.161 5.329-6.538 14.946-9.806 28.851-9.806s23.522 3.268 28.851 9.806c5.329 6.536 7.994 16.922 7.994 31.161 0 7.077-.563 13.03-1.687 17.86-1.123 4.828-3.059 9.034-5.807 12.614-2.747 3.58-6.536 6.202-11.366 7.869-4.828 1.665-10.825 2.498-17.985 2.498s-13.155-.833-17.984-2.498c-4.831-1.667-8.618-4.289-11.367-7.869-2.746-3.58-4.683-7.786-5.807-12.614-1.123-4.83-1.686-10.783-1.686-17.86zm26.853-12.989v32.472h10.366c3.415 0 5.891-.395 7.431-1.186 1.54-.792 2.31-2.603 2.31-5.433v-32.474h-10.491c-3.329 0-5.766.397-7.306 1.187-1.54.792-2.31 2.602-2.31 5.434zm-98.294 50.582l3.497-20.607c7.661 1.915 14.55 2.873 20.67 2.873 6.121 0 11.054-.251 14.802-.751v-6.244l-11.242-.999c-10.157-.916-17.131-3.352-20.921-7.308-3.787-3.955-5.681-9.804-5.681-17.546 0-10.659 2.31-17.987 6.931-21.984 4.621-3.996 12.47-5.994 23.543-5.994 11.074 0 21.065 1.04 29.975 3.124l-3.122 19.983c-7.744-1.25-13.947-1.874-18.611-1.874-4.662 0-8.617.207-11.865.624v6.121l8.994.873c10.906 1.084 18.443 3.684 22.605 7.807 4.163 4.121 6.246 9.846 6.246 17.173 0 5.245-.709 9.678-2.124 13.302-1.416 3.621-3.101 6.37-5.057 8.242-1.957 1.873-4.726 3.309-8.307 4.308-3.581 1.001-6.724 1.603-9.429 1.813-2.705.207-6.307.312-10.803.312-10.825 0-20.858-1.082-30.101-3.248zm-46.337 1.374l-2.497-19.983h10.366c2.581 0 4.226-.354 4.933-1.063.709-.706 1.062-1.603 1.062-2.685v-34.346H67.082v-19.983h35.345v57.453c0 6.743-1.665 11.863-4.996 15.36-3.331 3.497-8.118 5.247-14.363 5.247H63.584zm56.879 162.076c-5.207 0-9.43-4.224-9.43-9.431 0-5.207 4.223-9.431 9.43-9.431H273.73c5.207 0 9.431 4.224 9.431 9.431 0 5.207-4.224 9.431-9.431 9.431H120.463zM280.25 25.577v58.847c1.041 14.194 6.017 25.376 14.832 32.907 19.07 16.285 57.587 12.174 81.231 12.174L280.25 25.577z"/></svg>`,
      color: 'blue'
    },
    configSchema: {
      type: 'object',
      properties: {
        model: {
          type: 'object',
          title: {
            en_US: 'LLM',
            zh_Hans: '大语言模型'
          },
          'x-ui': {
            component: 'ai-model-select',
            span: 2,
            inputs: {
              modelType: AiModelTypeEnum.LLM,
              hiddenLabel: true
            }
          }
        },
        prompt: {
          type: 'string',
          title: {
            en_US: 'Prompt',
            zh_Hans: '提示词'
          },
          description: {
            en_US: 'Custom system prompt for structured output generation.',
            zh_Hans: '结构化输出生成的自定义系统提示词。'
          },
          'x-ui': {
            component: 'textarea',
            span: 2
          }
        },
        outputSchema: {
          type: 'string',
          title: {
            en_US: 'Output Schema',
            zh_Hans: '输出结构 Schema'
          },
          description: {
            en_US: 'JSON schema describing the output structure.',
            zh_Hans: '描述输出结构的 JSON Schema。'
          },
          'x-ui': {
            component: 'code-editor',
            inputs: {
              language: 'json',
              editable: true,
              lineNumbers: true
            },
            styles: {
              'min-height': '150px'
            }
          }
        },
        outputMethod: {
          type: 'string',
          title: {
            en_US: 'Output Method',
            zh_Hans: '输出方式'
          },
          description: {
            en_US: 'Structured output method supported by the model.',
            zh_Hans: '模型支持的结构化输出方式。'
          },
          enum: ['jsonSchema', 'jsonMode', 'functionCalling']
        },
        eventType: {
          type: 'string',
          title: {
            en_US: 'Event Type',
            zh_Hans: '事件类型'
          },
          description: {
            en_US: 'Custom type field for emitted chat event.',
            zh_Hans: '发送事件时的自定义类型字段。'
          }
        },
        eventTitle: {
          type: 'string',
          title: {
            en_US: 'Event Title',
            zh_Hans: '事件标题'
          },
          description: {
            en_US: 'Title shown in the event message.',
            zh_Hans: '事件消息显示的标题。'
          }
        }
      }
    } as TAgentMiddlewareMeta['configSchema']
  }

  async createMiddleware(options: StructuredOutputMiddlewareConfig, context: IAgentMiddlewareContext): Promise<AgentMiddleware> {
    const { data: userOptions, error } = interopSafeParse(contextSchema, options)
    if (error) {
      throw new Error(`StructuredOutputMiddleware configuration error: ${z4.prettifyError(error)}`)
    }

    const model = await this.commandBus.execute(new CreateModelClientCommand<BaseLanguageModel>(userOptions.model, {
      usageCallback: () => {
        return
      }
    }))

    return {
      name: STRUCTURED_OUTPUT_MIDDLEWARE_NAME,
      tools: [],
      afterAgent: async (state, runtime) => {
        const runtimeContext = (runtime as { context?: StructuredOutputRuntimeContext })?.context
        const outputSchema = runtimeContext?.outputSchema ?? userOptions.outputSchema ?? null
        if (!outputSchema) {
          return
        }

        const prompt = runtimeContext?.prompt ?? userOptions.prompt ?? DEFAULT_PROMPT
        const outputMethod = runtimeContext?.outputMethod ?? userOptions.outputMethod ?? DEFAULT_OUTPUT_METHOD
        const eventType = runtimeContext?.eventType ?? userOptions.eventType ?? DEFAULT_EVENT_TYPE
        const eventTitle = runtimeContext?.eventTitle ?? userOptions.eventTitle ?? DEFAULT_EVENT_TITLE

        const schema = new JsonSchemaValidator().parseAndValidate(outputSchema)
        const structuredModel = model.withStructuredOutput?.(schema, { method: outputMethod })
        if (!structuredModel) {
          throw new Error('Structured output is not supported by the selected model')
        }

        const messages: BaseMessage[] = prompt
          ? [new SystemMessage({ content: prompt }), ...(state.messages ?? [])]
          : [...(state.messages ?? [])]

        const configurable = runtime.configurable as TAgentRunnableConfigurable
        const { thread_id, checkpoint_ns, checkpoint_id, subscriber, executionId, agentKey, xpertName } = configurable ?? {}

        try {
          const response = await this.commandBus.execute(new WrapWorkflowNodeExecutionCommand(async () => {
            const response = await structuredModel.invoke(messages)
            return {
              state: response,
              output: response as JSONValue
            }
          }, {
            execution: {
              category: 'workflow',
              type: WorkflowNodeTypeEnum.MIDDLEWARE,
              inputs: {
                prompt,
                messages: mapChatMessagesToStoredMessages(state.messages ?? [])
              },
              parentId: executionId,
              threadId: thread_id,
              checkpointNs: checkpoint_ns,
              checkpointId: checkpoint_id,
              agentKey: context.node.key,
              title: context.node.title
            },
            subscriber
          }))

          const eventData: TChatEventMessage & {
            id: string
            data?: JSONValue
            executionId?: string
            agentKey?: string
            xpertName?: string
          } = {
            id: uuid(),
            type: eventType,
            title: eventTitle,
            status: 'success',
            created_date: new Date().toISOString(),
            data: response,
            executionId,
            agentKey,
            xpertName
          }

          await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, eventData)
        } catch (err) {
          const eventData: TChatEventMessage & {
            id: string
            executionId?: string
            agentKey?: string
            xpertName?: string
          } = {
            id: uuid(),
            type: eventType,
            title: eventTitle,
            status: 'fail',
            created_date: new Date().toISOString(),
            error: err instanceof Error ? err.message : String(err),
            executionId,
            agentKey,
            xpertName
          }
          await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, eventData)
        }
      }
    }
  }
}
