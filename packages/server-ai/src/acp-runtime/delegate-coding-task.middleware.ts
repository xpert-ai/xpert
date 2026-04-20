import { tool } from '@langchain/core/tools'
import {
  TAgentMiddlewareMeta,
  TAgentRunnableConfigurable
} from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
  AgentMiddleware,
  AgentMiddlewareStrategy,
  IAgentMiddlewareContext,
  IAgentMiddlewareStrategy,
  PromiseOrValue,
  resolveSandboxBackend
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { CreateAcpSubExecutionCommand } from './commands'

const ACP_DELEGATE_MIDDLEWARE_NAME = 'DelegateCodingTask'

const delegateSchema = z.object({
  harnessType: z.enum(['codex', 'claude_code']),
  permissionProfile: z.enum(['read_only', 'workspace_write', 'full_exec']).optional(),
  taskTitle: z.string().min(1, 'taskTitle is required.'),
  prompt: z.string().min(1, 'prompt is required.'),
  timeoutMs: z.number().int().positive().optional(),
  targetPaths: z.array(z.string().min(1)).optional()
})

@Injectable()
@AgentMiddlewareStrategy(ACP_DELEGATE_MIDDLEWARE_NAME)
export class DelegateCodingTaskMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
  readonly meta: TAgentMiddlewareMeta = {
    name: ACP_DELEGATE_MIDDLEWARE_NAME,
    label: {
      en_US: 'Delegate Coding Task',
      zh_Hans: '委派编码任务'
    },
    description: {
      en_US: 'Delegate a coding task to a sandboxed ACP CLI harness.',
      zh_Hans: '将编码任务委派给在沙箱中运行的 ACP CLI harness。'
    },
    features: ['sandbox'],
    configSchema: {
      type: 'object',
      properties: {}
    }
  }

  constructor(private readonly commandBus: CommandBus) {}

  createMiddleware(_options: Record<string, never>, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
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

            const sandboxWorkForType = configurable?.sandboxEnvironmentId
              ? 'environment'
              : configurable?.projectId
                ? 'project'
                : 'user'
            const sandboxWorkForId =
              configurable?.sandboxEnvironmentId ??
              configurable?.projectId ??
              configurable?.userId ??
              configurable?.thread_id

            if (!sandboxWorkForId) {
              throw new Error('Unable to resolve sandbox work scope for delegate_coding_task.')
            }

            const result = await this.commandBus.execute(
              new CreateAcpSubExecutionCommand({
                title: input.taskTitle,
                prompt: input.prompt,
                harnessType: input.harnessType,
                permissionProfile: input.permissionProfile,
                timeoutMs: input.timeoutMs,
                targetPaths: input.targetPaths,
                parentExecutionId: configurable.executionId,
                threadId: configurable?.thread_id,
                xpertId: context.xpertId ?? configurable?.xpertId,
                conversationId: context.conversationId,
                environmentId: configurable?.environmentId,
                sandboxEnvironmentId: configurable?.sandboxEnvironmentId ?? sandboxConfig?.environmentId ?? null,
                sandboxProvider: sandboxConfig?.provider ?? null,
                sandboxWorkForType,
                sandboxWorkForId,
                workingDirectory: sandboxConfig?.workingDirectory ?? backend.workingDirectory
              })
            )

            return result
          },
          {
            name: 'delegate_coding_task',
            description: 'Delegate a coding task to Codex CLI or Claude Code CLI in the sandbox backend.',
            schema: delegateSchema
          }
        )
      ]
    }
  }
}
