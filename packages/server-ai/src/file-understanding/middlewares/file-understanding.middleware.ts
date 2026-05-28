import { TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { createFileUnderstandingTools } from '../tools'

export const FILE_UNDERSTANDING_MIDDLEWARE_NAME = 'FileUnderstandingMiddleware'

export type FileUnderstandingMiddlewareOptions = {
    conversationId?: string
}

/**
 * Built-in, hidden middleware that mounts file-understanding tools for every
 * agent run. Keeping it in middleware makes file tools follow the same toolMap,
 * tracing, and runtime preference path as user-configured middleware tools.
 */
@Injectable()
@AgentMiddlewareStrategy(FILE_UNDERSTANDING_MIDDLEWARE_NAME)
export class FileUnderstandingMiddleware implements IAgentMiddlewareStrategy<FileUnderstandingMiddlewareOptions> {
    readonly meta: TAgentMiddlewareMeta = {
        name: FILE_UNDERSTANDING_MIDDLEWARE_NAME,
        label: {
            en_US: 'File Understanding',
            zh_Hans: '文件理解'
        },
        description: {
            en_US: 'Built-in tools for searching, reading, previewing, and citing parsed conversation files.',
            zh_Hans: '内置的会话文件检索、读取、预览和引用工具。'
        },
        builtin: true,
        icon: {
            type: 'svg',
            value: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.5H8V12Zm0 3h8v1.5H8V15Zm0 3h5v1.5H8V18Z"/></svg>',
            color: '#3b82f6'
        },
        configSchema: {
            type: 'object',
            properties: {}
        }
    }

    constructor(private readonly queryBus: QueryBus) {}

    createMiddleware(
        options: FileUnderstandingMiddlewareOptions | undefined,
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        return {
            name: FILE_UNDERSTANDING_MIDDLEWARE_NAME,
            tools: createFileUnderstandingTools(this.queryBus, {
                conversationId: options?.conversationId ?? context.conversationId
            })
        }
    }
}
