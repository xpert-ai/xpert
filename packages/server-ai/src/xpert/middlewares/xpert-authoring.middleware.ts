import { tool } from '@langchain/core/tools'
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@metad/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { Subscriber } from 'rxjs'
import { z } from 'zod/v3'
import { XpertAuthoringService } from './xpert-authoring.service'
import {
  AssistantDraftMutationResult,
  AuthoringAssistantEffect,
  AuthoringAssistantRequestContext,
  EditXpertPayload,
  Icon,
  NewXpertPayload
} from './xpert-authoring.types'

const XPERT_AUTHORING_MIDDLEWARE_NAME = 'XpertAuthoringMiddleware'

const requestContextSchema = z
  .object({
    workspaceId: z.string().optional(),
    env: z.record(z.any()).optional(),
    targetXpertId: z.string().optional(),
    unsaved: z.boolean().optional(),
    clientDraftHash: z.string().optional()
  })
  .passthrough()

@Injectable()
@AgentMiddlewareStrategy(XPERT_AUTHORING_MIDDLEWARE_NAME)
export class XpertAuthoringMiddleware implements IAgentMiddlewareStrategy {
  meta: TAgentMiddlewareMeta = {
    name: XPERT_AUTHORING_MIDDLEWARE_NAME,
    label: {
      en_US: 'Xpert Authoring Middleware',
      zh_Hans: 'Xpert 编写中间件'
    },
    description: {
      en_US: 'Provides server-side authoring tools for platform ChatKit assistants.',
      zh_Hans: '为平台 ChatKit 助手提供服务端编写工具。'
    },
    icon: {
      type: 'svg',
      value: Icon,
      color: 'blue'
    },
    configSchema: {
      type: 'object',
      properties: {},
      required: []
    }
  }

  constructor(private readonly authoringService: XpertAuthoringService) {}

  createMiddleware(
    options: unknown,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    void options
    void _context

    return {
      name: XPERT_AUTHORING_MIDDLEWARE_NAME,
      contextSchema: requestContextSchema,
      tools: this.createTools()
    }
  }

  private createTools() {
    return [this.createNewXpertTool(), this.createEditXpertTool()]
  }

  private createNewXpertTool() {
    return tool(
      async (input, config) => {
        const context = this.resolveContext(this.readContext(config))
        const result = await this.authoringService.newXpertFromContext(context, input as NewXpertPayload)

        this.emitEffect(config?.configurable, result, {
          name: 'navigate_to_studio',
          data: {
            xpertId: (result.updatedDraftFragment?.['team'] as { id?: string } | undefined)?.id ?? ''
          }
        })

        return result
      },
      {
        name: 'newXpert',
        description: 'Create a new Xpert draft in the current workspace from the user request.',
        schema: z.object({
          userIntent: z.string(),
          templateId: z.string().optional(),
          xpertName: z.string().optional()
        })
      }
    )
  }

  private createEditXpertTool() {
    return tool(
      async (input, config) => {
        const context = this.resolveContext(this.readContext(config))
        const result = await this.authoringService.editXpertFromContext(context, input as EditXpertPayload)

        this.emitEffect(config?.configurable, result, {
          name: 'refresh_studio',
          data: {
            xpertId: context.targetXpertId ?? ''
          }
        })

        return result
      },
      {
        name: 'editXpert',
        description: 'Edit the current Xpert Studio draft in a single tool call.',
        schema: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          avatar: z.record(z.any()).optional(),
          prompt: z.string().optional(),
          model: z.record(z.any()).optional(),
          starters: z.array(z.string()).optional()
        })
      }
    )
  }

  private resolveContext(runtimeContext: unknown): AuthoringAssistantRequestContext {
    const parsed = requestContextSchema.parse(this.normalizeContext(runtimeContext))

    return parsed
  }

  private readContext(config: unknown) {
    const runtimeConfig = config as
      | {
          context?: Record<string, unknown> & {
            env?: Record<string, unknown>
          }
          configurable?: {
            context?: Record<string, unknown> & {
              env?: Record<string, unknown>
            }
          }
        }
      | undefined

    const baseContext =
      runtimeConfig?.context && typeof runtimeConfig.context === 'object'
        ? { ...(runtimeConfig.context as Record<string, unknown>) }
        : runtimeConfig?.configurable?.context && typeof runtimeConfig.configurable.context === 'object'
          ? { ...(runtimeConfig.configurable.context as Record<string, unknown>) }
          : {}

    return baseContext
  }

  private normalizeContext(runtimeContext: unknown) {
    if (!runtimeContext || typeof runtimeContext !== 'object') {
      return runtimeContext ?? {}
    }

    const context = { ...(runtimeContext as Record<string, unknown>) }
    for (const key of ['workspaceId', 'targetXpertId', 'clientDraftHash'] as const) {
      if (context[key] === null) {
        delete context[key]
      }
    }

    if (context['env'] == null) {
      delete context['env']
    } else if (typeof context['env'] === 'object' && !Array.isArray(context['env'])) {
      context['env'] = { ...(context['env'] as Record<string, unknown>) }
    } else {
      delete context['env']
    }

    return context
  }

  private emitEffect(
    configurable: unknown,
    result: AssistantDraftMutationResult,
    effect: AuthoringAssistantEffect
  ) {
    if (result.status !== 'applied') {
      return
    }

    const runtimeConfig = configurable as
      | (TAgentRunnableConfigurable & {
          subscriber?: Subscriber<MessageEvent>
          xpertName?: string
        })
      | undefined

    if (!effect.data?.xpertId) {
      return
    }

    runtimeConfig?.subscriber?.next({
      data: {
        type: ChatMessageTypeEnum.EVENT,
        event: ChatMessageEventTypeEnum.ON_CLIENT_EFFECT,
        data: {
          name: effect.name,
          args: effect.data,
          tool_call_id: runtimeConfig?.tool_call_id,
          executionId: runtimeConfig?.executionId,
          agentKey: runtimeConfig?.agentKey,
          xpertName: runtimeConfig?.xpertName,
          created_date: new Date()
        }
      }
    } as MessageEvent)
  }
}
