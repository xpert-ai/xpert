import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import type { RunnableConfig } from '@langchain/core/runnables'
import {
  TAcpChatEvent,
  ChatMessageTypeEnum,
  ChatMessageEventTypeEnum,
  TAcpCodeContext,
  TMessageContentText,
  TAcpPermissionProfile,
  TAcpSessionMode,
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  resolveSandboxBackend
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { AcpRuntimeService } from './acp-runtime.service'
import { AcpSessionBridgeService } from './acp-session-bridge.service'

const ACP_DELEGATE_MIDDLEWARE_NAME = 'DelegateCodingTask'

type DelegateCodingTaskConfig = {
  enabledTargetRefs?: string[]
  defaultTargetRef?: string | null
  mode?: TAcpSessionMode
  reuseSession?: boolean
  permissionProfile?: TAcpPermissionProfile
  timeoutMs?: number
}

const delegateSchema = z.object({
  targetRef: z.string().min(1).optional(),
  mode: z.enum(['oneshot', 'persistent']).optional(),
  reuseSession: z.boolean().optional(),
  permissionProfile: z.enum(['read_only', 'workspace_write', 'full_exec']).optional(),
  taskTitle: z.string().min(1, 'taskTitle is required.'),
  prompt: z.string().min(1, 'prompt is required.'),
  timeoutMs: z.number().int().positive().optional(),
  targetPaths: z.array(z.string().min(1)).optional(),
  xpertId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  sourceConversationId: z.string().min(1).optional(),
  resumeThreadId: z.string().min(1).optional(),
  environmentId: z.string().min(1).optional(),
  sandboxEnvironmentId: z.string().min(1).optional(),
  repoConnectionId: z.string().min(1).optional(),
  repoId: z.string().min(1).optional(),
  repoName: z.string().min(1).optional(),
  repoOwner: z.string().min(1).optional(),
  repoSlug: z.string().min(1).optional(),
  branchName: z.string().min(1).optional(),
  baseBranchName: z.string().min(1).optional(),
  workspaceLabel: z.string().min(1).optional(),
  workspacePath: z.string().min(1).optional(),
  codingAgentName: z.string().min(1).optional(),
  providerDisplayName: z.string().min(1).optional(),
  taskKind: z.string().min(1).optional(),
  taskIntent: z.string().min(1).optional()
})

@Injectable()
@AgentMiddlewareStrategy(ACP_DELEGATE_MIDDLEWARE_NAME)
export class DelegateCodingTaskMiddleware implements IAgentMiddlewareStrategy<DelegateCodingTaskConfig> {
  readonly meta: TAgentMiddlewareMeta = {
    name: ACP_DELEGATE_MIDDLEWARE_NAME,
    label: {
      en_US: 'Codexpert ACP',
      zh_Hans: 'Codexpert ACP'
    },
    description: {
      en_US:
        'Delegate precise coding tasks to Codexpert through remote ACP. Clarify and confirm ambiguous intent before asking Codexpert to change code.',
      zh_Hans: '通过远程 ACP 委派精确的编码任务给 Codexpert；需求不清时必须先澄清并确认，再让 Codexpert 改代码。'
    },
    features: ['sandbox'],
    configSchema: {
      type: 'object',
      properties: {
        enabledTargetRefs: {
          type: 'array',
          items: {
            type: 'string'
          }
        },
        defaultTargetRef: {
          type: 'string'
        },
        mode: {
          type: 'string',
          enum: ['oneshot', 'persistent']
        },
        reuseSession: {
          type: 'boolean'
        },
        permissionProfile: {
          type: 'string',
          enum: ['read_only', 'workspace_write', 'full_exec']
        },
        timeoutMs: {
          type: 'number',
          minimum: 1
        }
      }
    }
  }

  constructor(
    private readonly runtimeService: AcpRuntimeService,
    private readonly bridgeService: AcpSessionBridgeService
  ) {}

  createMiddleware(options: DelegateCodingTaskConfig, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
    const policy = normalizePolicy(options)

    return {
      name: ACP_DELEGATE_MIDDLEWARE_NAME,
      tools: [
        tool(
          async (input, config) => {
            if (!context.xpertFeatures?.sandbox?.enabled) {
              throw new Error('Sandbox feature is required for delegate_coding_task.')
            }

            const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
            const sandboxConfig = configurable?.sandbox
            const backend = resolveSandboxBackend(sandboxConfig)
            if (!backend) {
              throw new Error('Sandbox backend is not available for delegate_coding_task.')
            }
            if (!configurable?.executionId) {
              throw new Error('Execution context is not available for delegate_coding_task.')
            }
            const conversationId = readString(context.conversationId)
            if (!conversationId) {
              throw new Error('delegate_coding_task requires an active conversation context.')
            }
            const runtimeConfig = configurable as
              | (TAgentRunnableConfigurable & {
                  environmentId?: string
                  sandboxEnvironmentId?: string
                })
              | undefined

            const sandboxWorkForType = runtimeConfig?.sandboxEnvironmentId
              ? 'environment'
              : runtimeConfig?.projectId
                ? 'project'
                : 'user'
            const sandboxWorkForId =
              runtimeConfig?.sandboxEnvironmentId ??
              runtimeConfig?.projectId ??
              runtimeConfig?.userId ??
              runtimeConfig?.thread_id

            if (!sandboxWorkForId) {
              throw new Error('Unable to resolve sandbox work scope for delegate_coding_task.')
            }

            const targetRef =
              readString(input.targetRef) ??
              readString(policy.defaultTargetRef) ??
              'remote_xpert_acp'

            if (!targetRef) {
              throw new Error('delegate_coding_task requires a configured default target or an explicit targetRef.')
            }

            if (policy.enabledTargetRefs.length > 0 && !policy.enabledTargetRefs.includes(targetRef)) {
              throw new Error(`ACP target ${targetRef} is not enabled for this ClawXpert.`)
            }

            const codeContext = resolveCodeContext({
              input,
              configurable,
              resolvedTargetRef: targetRef,
              workingDirectory: sandboxConfig?.workingDirectory ?? backend.workingDirectory
            })

            const { session } = await this.runtimeService.ensureDelegatedSession({
              title: input.taskTitle,
              prompt: input.prompt,
              targetRef,
              mode: input.mode ?? policy.mode,
              reuseSession: input.reuseSession ?? policy.reuseSession,
              permissionProfile: input.permissionProfile ?? policy.permissionProfile,
              timeoutMs: input.timeoutMs ?? policy.timeoutMs,
              targetPaths: input.targetPaths,
              codeContext,
              parentExecutionId: configurable.executionId,
              threadId: configurable?.thread_id,
              xpertId: context.xpertId ?? configurable?.xpertId,
              conversationId,
              environmentId: readString(input.environmentId) ?? runtimeConfig?.environmentId,
              sandboxEnvironmentId:
                readString(input.sandboxEnvironmentId) ??
                runtimeConfig?.sandboxEnvironmentId ??
                sandboxConfig?.environmentId ??
                null,
              sandboxProvider: sandboxConfig?.provider ?? null,
              sandboxWorkForType,
              sandboxWorkForId,
              workingDirectory: sandboxConfig?.workingDirectory ?? backend.workingDirectory
            })

            const result = await this.bridgeService.startPrompt({
              conversationId,
              sessionId: session.id,
              prompt: input.prompt,
              title: input.taskTitle,
              timeoutMs: input.timeoutMs ?? policy.timeoutMs,
              emit: async (event) => {
                await emitAcpChatEvent(config as RunnableConfig | undefined, configurable, event)
              },
              emitText: async (text) => {
                emitAcpVisibleText(configurable, text)
              }
            })

            return {
              sessionId: session.id,
              executionId: result.executionId,
              turnIndex: result.turnIndex,
              status: result.status,
              summary: result.summary ?? null,
              error: result.error ?? null
            }
          },
          {
            name: 'delegate_coding_task',
            description:
              'Delegate a coding task to Codexpert remote ACP. Use this only when the coding goal, target scope, and expected outcome are precise. If the user intent is ambiguous, incomplete, or could be interpreted in multiple ways, ask the user to clarify and confirm before calling this tool. Do not infer unstated requirements, broaden the requested scope, or translate a vague request into code changes on your own. Pass a specific taskTitle and prompt that preserve the user intent exactly, including constraints, target files, acceptance criteria, and any uncertainty already resolved with the user. The current reply streams Codexpert progress inline, and the tool result returns only after the ACP bridge reaches a terminal state.',
            schema: delegateSchema
          }
        )
      ]
    }
  }
}

async function emitAcpChatEvent(
  config: RunnableConfig | undefined,
  configurable: TAgentRunnableConfigurable | undefined,
  event: TAcpChatEvent
) {
  if (config) {
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, event, config).catch(() => {
      //
    })
    return
  }

  const subscriber = configurable?.subscriber
  if (subscriber) {
    subscriber.next({
      data: {
        type: ChatMessageTypeEnum.EVENT,
        event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
        data: event
      }
    } as MessageEvent)
  }
}

function emitAcpVisibleText(
  configurable: TAgentRunnableConfigurable | undefined,
  payload: string | TMessageContentText
) {
  const subscriber = configurable?.subscriber
  const normalized = normalizeVisibleTextPayload(payload)
  if (!subscriber || !normalized) {
    return
  }

  subscriber.next({
    data: {
      type: ChatMessageTypeEnum.MESSAGE,
      data: normalized
    }
  } as MessageEvent)
}

function normalizeVisibleTextPayload(payload: string | TMessageContentText): string | TMessageContentText | null {
  if (typeof payload === 'string') {
    return payload.trim() ? payload : null
  }

  if (payload?.type === 'text' && typeof payload.text === 'string' && payload.text.trim()) {
    return payload
  }

  return null
}

function normalizePolicy(options: DelegateCodingTaskConfig | null | undefined): Required<DelegateCodingTaskConfig> {
  const enabledTargetRefs = dedupeStrings(options?.enabledTargetRefs ?? [])
  const defaultTargetRef = readString(options?.defaultTargetRef) ?? 'remote_xpert_acp'

  return {
    enabledTargetRefs:
      defaultTargetRef && !enabledTargetRefs.includes(defaultTargetRef)
        ? [...enabledTargetRefs, defaultTargetRef]
        : enabledTargetRefs,
    defaultTargetRef,
    mode: options?.mode ?? 'persistent',
    reuseSession: options?.reuseSession ?? true,
    permissionProfile: options?.permissionProfile ?? 'workspace_write',
    timeoutMs: options?.timeoutMs ?? 15 * 60 * 1000
  }
}

function resolveCodeContext(input: {
  input: z.infer<typeof delegateSchema>
  configurable?: TAgentRunnableConfigurable
  resolvedTargetRef: string
  workingDirectory: string
}): TAcpCodeContext {
  const runtimeContext = extractRuntimeContext(input.configurable)
  const envContext = isRecord(runtimeContext.env) ? runtimeContext.env : {}

  return {
    xpertId:
      readString(input.input.xpertId) ??
      readString(runtimeContext.xpertId) ??
      readString(envContext.xpertId) ??
      null,
    projectId:
      readString(input.input.projectId) ??
      readString(runtimeContext.projectId) ??
      readString(envContext.projectId) ??
      readString(input.configurable?.projectId) ??
      null,
    sourceConversationId:
      readString(input.input.sourceConversationId) ??
      readString(runtimeContext.sourceConversationId) ??
      readString(envContext.sourceConversationId) ??
      null,
    resumeThreadId:
      readString(input.input.resumeThreadId) ??
      readString(runtimeContext.resumeThreadId) ??
      readString(envContext.resumeThreadId) ??
      null,
    repoConnectionId:
      readString(input.input.repoConnectionId) ??
      readString(runtimeContext.repoConnectionId) ??
      readString(envContext.repoConnectionId) ??
      null,
    repoId: readString(input.input.repoId) ?? readString(runtimeContext.repoId) ?? readString(envContext.repoId) ?? null,
    repoName:
      readString(input.input.repoName) ??
      readString(runtimeContext.repoName) ??
      readString(runtimeContext.repositoryName) ??
      readString(envContext.repoName) ??
      readString(envContext.repositoryName) ??
      null,
    repoOwner:
      readString(input.input.repoOwner) ??
      readString(runtimeContext.repoOwner) ??
      readString(envContext.repoOwner) ??
      null,
    repoSlug:
      readString(input.input.repoSlug) ??
      readString(runtimeContext.repoSlug) ??
      readString(envContext.repoSlug) ??
      null,
    branchName:
      readString(input.input.branchName) ??
      readString(runtimeContext.branchName) ??
      readString(envContext.branchName) ??
      null,
    baseBranchName:
      readString(input.input.baseBranchName) ??
      readString(runtimeContext.baseBranchName) ??
      readString(envContext.baseBranchName) ??
      null,
    workspaceLabel:
      readString(input.input.workspaceLabel) ??
      readString(runtimeContext.workspaceLabel) ??
      readString(runtimeContext.projectName) ??
      readString(envContext.workspaceLabel) ??
      null,
    workspacePath:
      readString(input.input.workspacePath) ??
      readString(runtimeContext.workspacePath) ??
      readString(runtimeContext.workspace_path) ??
      readString(envContext.workspacePath) ??
      readString(envContext.workspace_path) ??
      readString(input.workingDirectory) ??
      null,
    codingAgentName:
      readString(input.input.codingAgentName) ??
      readString(runtimeContext.codingAgentName) ??
      readString(envContext.codingAgentName) ??
      null,
    providerDisplayName:
      readString(input.input.providerDisplayName) ??
      readString(runtimeContext.providerDisplayName) ??
      readString(envContext.providerDisplayName) ??
      input.resolvedTargetRef,
    taskKind:
      readString(input.input.taskKind) ??
      readString(runtimeContext.taskKind) ??
      readString(envContext.taskKind) ??
      'coding',
    taskIntent:
      readString(input.input.taskIntent) ??
      readString(runtimeContext.taskIntent) ??
      readString(envContext.taskIntent) ??
      input.input.taskTitle
  }
}

function extractRuntimeContext(configurable?: TAgentRunnableConfigurable): Record<string, unknown> {
  const context = configurable?.context
  return isRecord(context) ? { ...context } : {}
}

function dedupeStrings(values: Array<string | null | undefined>) {
  const seen = new Set<string>()
  const deduped: string[] = []

  for (const value of values) {
    const normalized = readString(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }

    seen.add(normalized)
    deduped.push(normalized)
  }

  return deduped
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
