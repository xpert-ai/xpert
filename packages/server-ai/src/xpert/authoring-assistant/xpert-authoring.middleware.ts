import { tool } from '@langchain/core/tools'
import {
  AssistantDraftMutationResult,
  AuthoringAssistantEffect,
  AuthoringAssistantRequestContext,
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
import { XpertAuthoringDomainService } from './xpert-authoring-domain.service'

const XPERT_AUTHORING_MIDDLEWARE_NAME = 'XpertAuthoringMiddleware'

const middlewareOptionsSchema = z.object({
  mode: z.enum(['workspace-create', 'studio-agent-edit', 'platform-chatkit'])
})

const requestContextSchema = z
  .object({
    mode: z.enum(['workspace-create', 'studio-agent-edit']).optional(),
    workspaceId: z.string().nullable().optional(),
    targetXpertId: z.string().nullable().optional(),
    unsaved: z.boolean().optional(),
    clientDraftHash: z.string().nullable().optional()
  })
  .passthrough()

type AuthoringMiddlewareMode = z.infer<typeof middlewareOptionsSchema>['mode']

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
      value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M13.3 2.1a7 7 0 0 0 6.6 9.3l-8.6 8.6a2 2 0 1 1-2.8-2.8l8.6-8.6a7 7 0 0 0-8-9l3.3 3.3-2.1 2.1-4.9-4.9 2.1-2.1 3.1 3.1A7 7 0 0 0 13.3 2.1Z"/></svg>',
      color: 'blue'
    },
    configSchema: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['workspace-create', 'studio-agent-edit', 'platform-chatkit']
        }
      },
      required: ['mode']
    }
  }

  constructor(private readonly authoringDomainService: XpertAuthoringDomainService) {}

  createMiddleware(
    options: unknown,
    _context: IAgentMiddlewareContext
  ): PromiseOrValue<AgentMiddleware> {
    void _context
    const parsed = middlewareOptionsSchema.parse(options ?? {})

    return {
      name: XPERT_AUTHORING_MIDDLEWARE_NAME,
      contextSchema: requestContextSchema,
      tools: this.createTools(parsed.mode)
    }
  }

  private createTools(mode: AuthoringMiddlewareMode) {
    if (mode === 'workspace-create') {
      return [
        this.createReadPageContextTool(mode),
        this.createWorkspaceDraftTool(mode)
      ]
    }

    if (mode === 'studio-agent-edit') {
      return [
        this.createReadPageContextTool(mode),
        this.createReadStudioSummaryTool(mode),
        this.createReadPrimaryAgentTool(mode),
        this.createUpdateTeamMetadataTool(mode),
        this.createUpdatePrimaryAgentTool(mode),
        this.createUpdateStartersTool(mode)
      ]
    }

    return [
      this.createReadPageContextTool(mode),
      this.createWorkspaceDraftTool(mode),
      this.createReadStudioSummaryTool(mode),
      this.createReadPrimaryAgentTool(mode),
      this.createUpdateTeamMetadataTool(mode),
      this.createUpdatePrimaryAgentTool(mode),
      this.createUpdateStartersTool(mode)
    ]
  }

  private createReadPageContextTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (_, config) => this.authoringDomainService.buildPageContext(this.resolveContext(mode, this.readContext(config))),
      {
        name: 'read_page_context',
        description:
          mode === 'workspace-create'
            ? 'Read the current workspace page context before creating a new expert.'
            : mode === 'studio-agent-edit'
              ? 'Read the current Studio authoring page context.'
              : 'Read the current platform authoring page context.',
        schema: z.object({})
      }
    )
  }

  private createWorkspaceDraftTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (input, config) => {
        const context = this.resolveContext(mode, this.readContext(config))
        const result = await this.authoringDomainService.createWorkspaceDraftFromContext(context, input)

        this.emitEffect(config?.configurable, result, {
          name: 'navigate_to_studio',
          data: {
            xpertId: (result.updatedDraftFragment?.['team'] as { id?: string } | undefined)?.id ?? ''
          }
        })

        return result
      },
      {
        name: 'create_xpert_draft_from_request',
        description: 'Create a new Xpert draft in the current workspace from the user request.',
        schema: z.object({
          workspaceId: z.string().nullable().optional(),
          userIntent: z.string(),
          templateId: z.string().nullable().optional(),
          xpertName: z.string().nullable().optional()
        })
      }
    )
  }

  private createReadStudioSummaryTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (_, config) => this.authoringDomainService.readStudioSummary(this.resolveContext(mode, this.readContext(config))),
      {
        name: 'read_studio_summary',
        description: 'Read a compact summary of the current Studio draft.',
        schema: z.object({})
      }
    )
  }

  private createReadPrimaryAgentTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (_, config) => this.authoringDomainService.readPrimaryAgent(this.resolveContext(mode, this.readContext(config))),
      {
        name: 'read_primary_agent',
        description: 'Read the current primary agent summary from Studio.',
        schema: z.object({})
      }
    )
  }

  private createUpdateTeamMetadataTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (input, config) => {
        const result = await this.authoringDomainService.applyStudioMutationFromContext(
          this.resolveContext(mode, this.readContext(config)),
          'update_xpert_team_metadata',
          input
        )

        this.emitEffect(config?.configurable, result, {
          name: 'refresh_studio',
          data: {
            xpertId: this.resolveContext(mode, this.readContext(config)).targetXpertId ?? ''
          }
        })

        return result
      },
      {
        name: 'update_xpert_team_metadata',
        description: 'Update the current Xpert team metadata in the Studio draft.',
        schema: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          avatar: z.record(z.any()).nullable().optional()
        })
      }
    )
  }

  private createUpdatePrimaryAgentTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (input, config) => {
        const context = this.resolveContext(mode, this.readContext(config))
        const result = await this.authoringDomainService.applyStudioMutationFromContext(
          context,
          'update_primary_agent',
          input
        )

        this.emitEffect(config?.configurable, result, {
          name: 'refresh_studio',
          data: {
            xpertId: context.targetXpertId ?? ''
          }
        })

        return result
      },
      {
        name: 'update_primary_agent',
        description: 'Update the current primary agent in the Studio draft.',
        schema: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          prompt: z.string().optional(),
          model: z.record(z.any()).nullable().optional()
        })
      }
    )
  }

  private createUpdateStartersTool(mode: AuthoringMiddlewareMode) {
    return tool(
      async (input, config) => {
        const context = this.resolveContext(mode, this.readContext(config))
        const result = await this.authoringDomainService.applyStudioMutationFromContext(
          context,
          'update_xpert_starters',
          input
        )

        this.emitEffect(config?.configurable, result, {
          name: 'refresh_studio',
          data: {
            xpertId: context.targetXpertId ?? ''
          }
        })

        return result
      },
      {
        name: 'update_xpert_starters',
        description: 'Replace the current conversation starters in the Studio draft.',
        schema: z.object({
          starters: z.array(z.string())
        })
      }
    )
  }

  private resolveContext(
    mode: AuthoringMiddlewareMode,
    runtimeContext: unknown
  ): AuthoringAssistantRequestContext {
    const parsed = requestContextSchema.parse(runtimeContext ?? {})
    const effectiveMode =
      mode === 'platform-chatkit'
        ? parsed.mode ?? 'workspace-create'
        : mode

    return {
      mode: effectiveMode,
      ...parsed
    }
  }

  private readContext(config: unknown) {
    const runtimeConfig = config as
      | {
          context?: unknown
          configurable?: {
            context?: unknown
          }
        }
      | undefined

    return runtimeConfig?.context ?? runtimeConfig?.configurable?.context
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
