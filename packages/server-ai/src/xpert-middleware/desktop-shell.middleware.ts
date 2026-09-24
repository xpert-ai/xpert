import { Injectable } from '@nestjs/common'
import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { z } from 'zod/v3'
import {
    AgentMiddlewareStrategy,
    type AgentMiddleware,
    type IAgentMiddlewareContext,
    type IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    getToolCallIdFromConfig,
    type TAgentMiddlewareMeta,
    type TAgentRunnableConfigurable,
    type ShellResult
} from '@xpert-ai/contracts'
import { LIMITS, parseInput, isId } from '@xpert-ai/desktop-protocol'
import { DesktopShellOperationService } from '../desktop-shell/desktop-shell-operation.service'
import { parseShellBoundary, shellError } from '../desktop-shell/desktop-shell.errors'

const schema = z.object({
    action: z.enum(['exec', 'status', 'cancel']),
    command: z.string().min(1).max(LIMITS.command).optional(),
    cwd: z.string().min(1).max(4096).optional(),
    timeout_sec: z.number().int().min(1).max(LIMITS.maxTimeout).optional(),
    operationId: z.string().uuid().optional(),
    cursor: z.number().int().nonnegative().optional()
})

@Injectable()
@AgentMiddlewareStrategy('DesktopShell')
export class DesktopShellMiddleware implements IAgentMiddlewareStrategy {
    constructor(private readonly operations: DesktopShellOperationService) {}
    meta: TAgentMiddlewareMeta = {
        name: 'DesktopShell',
        icon: { type: 'emoji', value: 'desktop_computer' },
        label: { en_US: 'Desktop Shell', zh_Hans: '\u684c\u9762 Shell' },
        description: {
            en_US: 'Execute commands on the computer authorized for this conversation. The server sandbox remains separate.',
            zh_Hans: '\u5728\u5f53\u524d\u4f1a\u8bdd\u6388\u6743\u7684\u7535\u8111\u4e0a\u6267\u884c\u547d\u4ee4\u3002'
        },
        configSchema: { type: 'object', properties: {} }
    }
    getToolNames() {
        return ['desktop_shell']
    }
    createMiddleware(_options: unknown, context: IAgentMiddlewareContext): AgentMiddleware {
        const shell = tool(
            async (raw, config) => {
                const input = parseShellBoundary(parseInput, raw)
                const runtime = config?.configurable as TAgentRunnableConfigurable | undefined
                const threadId = runtime?.thread_id
                const runId = runtime?.rootExecutionId ?? runtime?.executionId
                const toolCallId = getToolCallIdFromConfig(config)
                const grantId = runtime?.context?.desktopShellGrantId
                if (!isId(threadId) || !isId(runId) || typeof toolCallId !== 'string') shellError('INVALID_MESSAGE')
                const scope = {
                    tenantId: context.tenantId,
                    organizationId: context.organizationId,
                    userId: context.userId
                }
                if (!scope.organizationId) shellError('GRANT_REVOKED', 403)
                let result: ShellResult
                if (input.action === 'exec') {
                    if (!isId(grantId)) shellError('GRANT_REVOKED', 403)
                    const operation = await this.operations.execute(input, {
                        ...scope,
                        threadId,
                        runId,
                        toolCallId,
                        grantId
                    })
                    const cancel = () => {
                        void this.operations.cancel(operation.id, scope, threadId).catch(() => undefined)
                    }
                    config?.signal?.addEventListener('abort', cancel, { once: true })
                    try {
                        result = await this.operations.wait(operation.id, scope, config?.signal)
                    } finally {
                        config?.signal?.removeEventListener('abort', cancel)
                    }
                } else if (input.action === 'cancel')
                    result = await this.operations.cancel(input.operationId, scope, threadId)
                else
                    result = await this.operations.result(
                        await this.operations.requireOperation(input.operationId, scope, threadId),
                        input.cursor
                    )
                await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
                    id: toolCallId,
                    category: 'Tool',
                    type: ChatMessageStepCategory.Program,
                    tool: 'desktop_shell',
                    title: `Desktop Shell · ${result.device.name}`,
                    input,
                    status: ['pending', 'running', 'cancel_requested'].includes(result.state)
                        ? 'running'
                        : result.state === 'succeeded'
                          ? 'success'
                          : 'fail',
                    output: result.stdout + result.stderr,
                    data: {
                        code: input.action === 'exec' ? input.command : input.action,
                        output: result.stdout + result.stderr
                    },
                    created_date: new Date()
                }).catch(() => undefined)
                return JSON.stringify(result)
            },
            {
                name: 'desktop_shell',
                schema,
                description:
                    'Execute a non-interactive command on the user-authorized desktop computer, not the server sandbox. Use exec to start, status with operationId and cursor to collect incremental output, and cancel to stop. Each exec starts a fresh shell; specify an absolute cwd. Long commands return running. The computer OS, shell and cwd are in the result. Do not retry an unknown result or an offline device on another machine. No interactive stdin, sudo or persistent background services. Use sandbox_shell for server-side work.'
            }
        )
        return { name: 'DesktopShell', tools: [shell] }
    }
}
