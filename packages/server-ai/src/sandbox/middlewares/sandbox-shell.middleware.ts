import { FileActivityStorage } from './file-activity-storage.service'
import { withStreamingToolMessage } from './tool-message.utils'
import { tool } from '@langchain/core/tools'
import { TAgentMiddlewareMeta, TAgentRunnableConfigurable, getToolCallIdFromConfig } from '@xpert-ai/contracts'
import { Inject, Injectable } from '@nestjs/common'
import {
    AgentMiddleware,
    ExecuteResponse,
    SandboxBackendProtocol,
    AgentMiddlewareStrategy,
    DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue,
    SANDBOX_SHELL_TIMEOUT_LIMITS_SEC,
    resolveSandboxBackend,
    secondsToMilliseconds
} from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { z } from 'zod/v3'
import { observeFileChanges } from './file-activity'
import { FILE_PRESENTATION_DESCRIPTION } from './file-presentation-format'

const SANDBOX_SHELL_MIDDLEWARE_NAME = 'SandboxShell'
const SANDBOX_SHELL_TOOL_NAME = 'sandbox_shell'

const shellToolSchema = z.object({
    command: z.string().min(1, 'Command is required.'),
    timeout_sec: z
        .number()
        .int()
        .min(
            SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.min,
            `Timeout must be at least ${SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.min} second.`
        )
        .max(
            SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.max,
            `Timeout must be at most ${SANDBOX_SHELL_TIMEOUT_LIMITS_SEC.max} seconds.`
        )
        .optional()
        .describe(
            `Optional command timeout in seconds. Defaults to ${DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC} seconds. Increase this for long-running commands like npm install, pnpm install, cargo build, or test suites. The sandbox terminates the command when the timeout is reached and returns an explicit timeout message.`
        )
})

function assertSandboxFeatureEnabled(context: IAgentMiddlewareContext, middlewareName: string) {
    if (context.xpertFeatures?.sandbox?.enabled === true) {
        return
    }

    throw new Error(`${middlewareName} requires the xpert sandbox feature to be enabled.`)
}

function getToolCallId(config: unknown): string {
    const toolCallId = getToolCallIdFromConfig(config)
    return typeof toolCallId === 'string' && toolCallId.length > 0 ? toolCallId : randomUUID()
}

function stringifyToolResult(value: unknown): string {
    if (typeof value === 'string') {
        return value
    }

    if (value instanceof Error) {
        return value.message
    }

    try {
        const serialized = JSON.stringify(value, null, 2)
        return serialized ?? String(value)
    } catch {
        return String(value)
    }
}

@Injectable()
@AgentMiddlewareStrategy(SANDBOX_SHELL_MIDDLEWARE_NAME)
export class SandboxShellMiddleware implements IAgentMiddlewareStrategy {
    constructor(
        @Inject(FileActivityStorage) private readonly fileActivityStorage: Pick<FileActivityStorage, 'persist'>
    ) {}

    meta: TAgentMiddlewareMeta = {
        name: SANDBOX_SHELL_MIDDLEWARE_NAME,
        icon: {
            type: 'svg',
            value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 22 22"><path d="M20 3V19H19V20H3V19H2V3H3V2H19V3H20M18 6H4V18H18V6M9 9V10H10V11H11V13H10V14H9V15H8V16H6V14H7V13H8V11H7V10H6V8H8V9H9M11 16V14H16V16H11Z"/></svg>`
        },
        label: {
            en_US: 'Sandbox Shell',
            zh_Hans: '沙箱命令行工具'
        },
        description: {
            en_US: 'Adds a shell tool that runs commands via the sandbox backend.',
            zh_Hans: '添加一个通过沙箱后端运行命令的命令行工具。'
        },
        features: ['sandbox'],
        configSchema: {
            type: 'object',
            properties: {}
        }
    }

    createMiddleware(_options: unknown, context: IAgentMiddlewareContext): PromiseOrValue<AgentMiddleware> {
        assertSandboxFeatureEnabled(context, SANDBOX_SHELL_MIDDLEWARE_NAME)

        const shellTool = tool(
            async ({ command, timeout_sec }, config) => {
                const configurable = config?.configurable as TAgentRunnableConfigurable | undefined
                const backend = resolveSandboxBackend(configurable?.sandbox)

                if (!backend) {
                    throw new Error('Sandbox backend is not available for SandboxShell.')
                }

                const timeoutSec = timeout_sec ?? DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC
                const toolCallId = getToolCallId(config)
                const observe = (run: () => Promise<ExecuteResponse>) =>
                    observeFileChanges(
                        this.fileActivityStorage,
                        context,
                        backend,
                        toolCallId,
                        SANDBOX_SHELL_TOOL_NAME,
                        run
                    )
                const observedBackend: Pick<SandboxBackendProtocol, 'execute' | 'streamExecute'> = {
                    execute: (command, options) => observe(async () => backend.execute(command, options))
                }
                if (backend.streamExecute) {
                    const streamExecute = backend.streamExecute.bind(backend)
                    observedBackend.streamExecute = (command, onOutput, options) =>
                        observe(() => streamExecute(command, onOutput, options))
                }
                const result = await withStreamingToolMessage(
                    toolCallId,
                    SANDBOX_SHELL_TOOL_NAME,
                    command,
                    observedBackend,
                    { timeoutMs: secondsToMilliseconds(timeoutSec) }
                )

                if (result.timedOut) {
                    return stringifyToolResult(result.output)
                }
                if (result.exitCode !== 0) {
                    return `Exit code ${result.exitCode}\n${result.output}`
                }
                return stringifyToolResult(result.output)
            },
            {
                name: SANDBOX_SHELL_TOOL_NAME,
                description: `Execute a shell command in the configured sandbox backend.

${FILE_PRESENTATION_DESCRIPTION}

Default timeout: ${DEFAULT_SANDBOX_SHELL_TIMEOUT_SEC} seconds.

Use timeout_sec for long-running commands such as npm install, pnpm install, cargo build, pytest, or large test/build jobs. When the timeout is reached, the sandbox terminates the command and returns explicit timeout information.

Do not use this tool to background a long-running server with &, nohup, or disown. Use the SandboxService middleware's sandbox_service_start tool for managed background services so the agent can list, inspect logs, restart, stop, and preview them later.`,
                schema: shellToolSchema
            }
        )

        return {
            name: SANDBOX_SHELL_MIDDLEWARE_NAME,
            tools: [shellTool]
        }
    }
}
