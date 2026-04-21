import { tool } from '@langchain/core/tools'
import { getToolCallIdFromConfig, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { BadRequestException, Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy
} from '@xpert-ai/plugin-sdk'
import { createHash } from 'crypto'
import { z } from 'zod/v3'
import {
    KNOWLEDGEBASE_WRITER_MIDDLEWARE,
    WRITE_KNOWLEDGE_CHUNK_TOOL
} from './agent-knowledge-writer.constants'
import {
    TAgentKnowledgeChunkInputMetadata,
    WriteAgentKnowledgeChunkCommand
} from './commands'

type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue }

const jsonPrimitiveSchema = z.union([z.string(), z.number(), z.boolean(), z.null()])
const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([jsonPrimitiveSchema, z.array(jsonValueSchema), z.record(jsonValueSchema)])
)
const metadataSchema: z.ZodType<TAgentKnowledgeChunkInputMetadata> = z.record(jsonValueSchema)

const baseSchema = z.object({
    text: z.string().min(1).describe('Text chunk content to append into the target knowledgebase'),
    title: z.string().optional().describe('Optional chunk title stored with the chunk metadata'),
    metadata: metadataSchema.optional().describe('Optional JSON metadata stored with the chunk')
})

type TBaseWriteInput = {
    text: string
    title?: string
    metadata?: TAgentKnowledgeChunkInputMetadata
}

type TMultiKnowledgebaseWriteInput = TBaseWriteInput & {
    knowledgebaseId?: string
}

@Injectable()
@AgentMiddlewareStrategy(KNOWLEDGEBASE_WRITER_MIDDLEWARE)
export class KnowledgebaseWriterMiddleware implements IAgentMiddlewareStrategy<Record<string, never>> {
    readonly meta: TAgentMiddlewareMeta = {
        name: KNOWLEDGEBASE_WRITER_MIDDLEWARE,
        label: {
            en_US: 'Knowledgebase Writer',
            zh_Hans: '知识库写入器'
        },
        description: {
            en_US: 'Append agent-authored text chunks into the knowledgebases connected to the current agent.',
            zh_Hans: '将当前 agent 主动沉淀的文本块追加写入该 agent 已连接的知识库。'
        },
        icon: {
            type: 'svg',
            value: `<?xml version="1.0" encoding="utf-8"?><svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px" viewBox="0 0 93.84 122.88" xml:space="preserve"><g><path d="M9.65,104.48l0.24-41.94H5.16v53.36c6.51-1.68,13.03-2.75,19.61-2.79c6.07-0.04,12.14,0.81,18.23,2.87 c-3.78-3.06-8-5.31-12.49-6.78c-5.67-1.85-11.79-2.46-18.07-1.92c-1.42,0.12-2.66-0.94-2.78-2.35 C9.64,104.77,9.64,104.63,9.65,104.48L9.65,104.48L9.65,104.48z M16.95,34.55c-0.6,0.01-1.14-0.22-1.54-0.59 c-0.41-0.39-0.67-0.92-0.69-1.54c-0.02-0.6,0.21-1.17,0.59-1.57c0.39-0.41,0.92-0.67,1.54-0.69l4.8-0.16 c0.6-0.02,1.17,0.21,1.57,0.59c0.41,0.39,0.67,0.92,0.69,1.54v0.03h0.01l-0.01,0.08c-0.01,0.56-0.23,1.08-0.59,1.46 c-0.39,0.41-0.92,0.67-1.54,0.69h-0.03v0.01h-0.05L16.95,34.55L16.95,34.55L16.95,34.55L16.95,34.55L16.95,34.55z M46.51,2.15 C46.53,1.54,46.79,1,47.2,0.61c0.4-0.38,0.95-0.61,1.54-0.6V0c0.05,0,0.1,0.01,0.15,0.01c0.55,0.05,1.05,0.3,1.41,0.67 c0.38,0.4,0.61,0.94,0.6,1.54h0.01c0,0.04,0,0.08-0.01,0.11l-0.12,4.69h0.01c0,0.05-0.01,0.1-0.01,0.15 c-0.04,0.56-0.3,1.05-0.67,1.41c-0.4,0.38-0.95,0.61-1.54,0.6v0c-0.05,0-0.1,0-0.15-0.01c-0.56-0.04-1.05-0.3-1.41-0.67 c-0.38-0.4-0.61-0.95-0.61-1.54h-0.01c0-0.04,0-0.08,0.01-0.11L46.51,2.15L46.51,2.15L46.51,2.15L46.51,2.15L46.51,2.15z M67.27,8.62c0.34-0.51,0.85-0.82,1.39-0.93c0.55-0.11,1.14-0.01,1.65,0.33l0.01,0.01c0.5,0.33,0.82,0.85,0.93,1.4 s0,1.14-0.33,1.65l-2.67,4c-0.34,0.51-0.85,0.83-1.4,0.94c-0.55,0.11-1.14,0.01-1.65-0.33c-0.51-0.34-0.82-0.85-0.93-1.4 c-0.11-0.55-0.01-1.14,0.33-1.65L67.27,8.62L67.27,8.62L67.27,8.62L67.27,8.62L67.27,8.62z M76.73,27.74l0.07-0.01 c0.57-0.03,1.1,0.15,1.52,0.49c0.44,0.35,0.73,0.88,0.8,1.48v0.02c0,0,0,0.06,0,0.07c0.03,0.57-0.15,1.11-0.49,1.52 c-0.35,0.44-0.88,0.73-1.48,0.8l-4.78,0.5c-0.6,0.06-1.18-0.13-1.61-0.48c-0.44-0.35-0.74-0.88-0.8-1.48 c-0.06-0.6,0.13-1.18,0.48-1.61c0.35-0.44,0.88-0.74,1.48-0.8C73.53,28.08,75.13,27.89,76.73,27.74L76.73,27.74L76.73,27.74 L76.73,27.74L76.73,27.74L76.73,27.74z M22.7,10.37C22.26,9.95,22.02,9.4,22,8.84c-0.02-0.56,0.17-1.13,0.58-1.57 c0.42-0.45,0.97-0.68,1.53-0.7c0.56-0.02,1.13,0.17,1.57,0.58l3.52,3.28c0.44,0.41,0.68,0.97,0.7,1.53 c0.02,0.57-0.17,1.13-0.58,1.57c-0.41,0.44-0.97,0.68-1.53,0.7c-0.57,0.02-1.13-0.17-1.57-0.58L22.7,10.37L22.7,10.37L22.7,10.37 L22.7,10.37L22.7,10.37z M33.75,51.35c-0.83-0.95-1.68-1.92-2.5-3.03c-0.85-1.14-1.66-2.43-2.38-3.96h-0.01 c-0.69-1.49-1.24-3.02-1.61-4.59c-0.37-1.56-0.56-3.16-0.54-4.81c0.01-1.64,0.23-3.29,0.66-4.97c0.44-1.68,1.08-3.37,1.96-5.06 l0.08-0.15c1.14-1.94,2.52-3.57,4.06-4.91c1.64-1.43,3.45-2.52,5.35-3.3l0.15-0.05c1.49-0.6,3.03-1,4.58-1.22 c1.64-0.24,3.32-0.27,5-0.12c1.63,0.15,3.24,0.48,4.79,0.98c1.56,0.5,3.05,1.17,4.44,1.99c1.82,1.08,3.48,2.43,4.89,4.02 c1.36,1.54,2.47,3.29,3.27,5.23c0.43,1.04,0.79,2.17,1.06,3.38c0.27,1.19,0.43,2.45,0.47,3.76c0.04,1.36-0.06,2.76-0.33,4.21 c-0.25,1.36-0.66,2.75-1.23,4.17c-0.05,0.13-0.12,0.25-0.2,0.36l-8.14,12.65c-0.29,0.45-0.75,0.73-1.25,0.8L39.25,59.2 c-0.9,0.13-1.73-0.44-1.97-1.29c-0.43-1.26-0.98-2.53-1.6-3.69C35.09,53.12,34.43,52.13,33.75,51.35L33.75,51.35z M34.11,46.2 c0.75,1.01,1.54,1.92,2.32,2.81c0.87,1,1.68,2.21,2.39,3.52c0.5,0.93,0.96,1.92,1.36,2.93L55,53.33l7.64-11.88 c0.46-1.15,0.78-2.27,0.98-3.34c0.22-1.2,0.31-2.35,0.28-3.46v-0.01c-0.03-1.07-0.17-2.1-0.38-3.08c-0.21-0.96-0.52-1.9-0.89-2.81 c-0.64-1.58-1.54-2.99-2.62-4.22c-1.15-1.3-2.52-2.41-4.04-3.31c-1.17-0.69-2.42-1.25-3.71-1.67c-1.31-0.42-2.66-0.7-4.02-0.83 c-1.38-0.13-2.78-0.09-4.17,0.1c-1.29,0.18-2.55,0.51-3.75,0.99l-0.14,0.06c-1.56,0.63-3.03,1.52-4.34,2.67 c-1.24,1.08-2.36,2.41-3.3,4.01l-0.01,0.02c-0.77,1.48-1.32,2.91-1.68,4.31c-0.36,1.39-0.54,2.76-0.55,4.11 c-0.01,1.33,0.15,2.66,0.46,3.97c0.31,1.31,0.77,2.6,1.37,3.89l-0.01,0C32.7,44.14,33.39,45.22,34.11,46.2L34.11,46.2z M51.15,77.03c-1.14,0.67-2.42,1.05-3.7,1.13c-1.3,0.08-2.6-0.17-3.8-0.74c-5.84-2.85-4.25-9.5-5.41-14.64l17.92-2.67l0,0l0,0l0,0 C54.89,66.09,57.47,73.37,51.15,77.03L51.15,77.03z M79.13,60.35c-0.01-0.12-0.03-0.25-0.03-0.39c0-0.13,0.01-0.26,0.03-0.39v-8.49 c-2.56-0.24-4.27-0.26-6.82-0.04c0.57-1.82,1.19-3.49,1.85-5.27c2.95-0.11,5.03,0.05,7.92,0.48c1.28,0.18,2.2,1.29,2.2,2.54l0,0 v8.59h0.01h6.98c1.42,0,2.57,1.16,2.57,2.58v59.3c0,1.42-1.15,2.57-2.57,2.57c-0.29,0-0.57-0.04-0.83-0.14 c-7.18-2.05-14.31-3.42-21.37-3.47c-6.89-0.04-13.77,1.17-20.68,4.21c-0.43,0.28-0.94,0.44-1.47,0.43 c-0.52,0.01-1.03-0.15-1.46-0.43c-6.9-3.05-13.79-4.26-20.68-4.21c-7.06,0.04-14.19,1.41-21.38,3.47 c-0.26,0.09-0.54,0.14-0.83,0.14C1.15,121.85,0,120.7,0,119.27V59.96c0-1.42,1.15-2.58,2.57-2.58h7.34l0.05-8.6 c0.01-1.24,0.88-2.26,2.04-2.5l0,0c2.63-0.55,4.4-0.83,7.33-0.81c0.37,1.06,0.81,2.11,1.29,3.15c0.34,0.73,0.7,1.42,1.07,2.08 c-2.64-0.19-4.16-0.1-6.62,0.25l-0.29,51.02c5.96-0.21,11.8,0.54,17.29,2.34c4.37,1.42,8.51,3.51,12.3,6.26l0,0V85.46l5.15-0.76 v26.38c4.37-2.92,8.83-5.32,13.42-6.95c5.23-1.86,10.61-2.75,16.17-2.31V60.35L79.13,60.35L79.13,60.35z M52.03,115.59 c5.69-1.79,11.37-2.52,17.05-2.49c6.57,0.04,13.11,1.12,19.61,2.79V62.54h-4.41v42.17c0,1.42-1.15,2.57-2.57,2.57 c-0.21,0-0.41-0.02-0.6-0.07c-5.63-0.89-11.1-0.15-16.43,1.75C60.4,110.5,56.18,112.79,52.03,115.59L52.03,115.59L52.03,115.59z"/></g></svg>`
        },
        configSchema: {
            type: 'object',
            properties: {}
        }
    }

    constructor(
        private readonly commandBus: CommandBus
    ) {}

    async createMiddleware(
        _options: Record<string, never>,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        return {
            name: KNOWLEDGEBASE_WRITER_MIDDLEWARE,
            tools: [this.createWriteTool(context)]
        }
    }

    private createWriteTool(context: IAgentMiddlewareContext) {
        const schema = baseSchema.extend({
            knowledgebaseId: z
                .string()
                .optional()
                .describe('Required when the current agent is connected to multiple knowledgebases')
        })

        return tool(
            async (parameters, config) => {
                const input = this.resolveWriteInput(parameters)
                const xpertId = context.xpertId
                const agentKey = context.agentKey
                const knowledgebaseIds = context.knowledgebaseIds ?? []

                if (!xpertId || !agentKey) {
                    throw new BadRequestException('The current runtime does not include the agent context required for KB writes')
                }

                if (!knowledgebaseIds.length) {
                    throw new BadRequestException(`Agent '${agentKey}' has no connected knowledgebases`)
                }

                const targetKnowledgebaseId =
                    knowledgebaseIds.length === 1
                        ? knowledgebaseIds[0]
                        : input.knowledgebaseId

                if (!targetKnowledgebaseId) {
                    throw new BadRequestException('knowledgebaseId is required when multiple knowledgebases are connected')
                }

                if (!knowledgebaseIds.includes(targetKnowledgebaseId)) {
                    throw new BadRequestException(`Knowledgebase '${targetKnowledgebaseId}' is not connected to agent '${agentKey}'`)
                }

                const runtimeContext = this.readRuntimeContext(config)
                const toolCallId = getToolCallIdFromConfig(config)
                const writeKey =
                    toolCallId ||
                    this.createFallbackWriteKey(
                        runtimeContext.executionId,
                        targetKnowledgebaseId,
                        input.title,
                        input.text
                    )

                return this.commandBus.execute(
                    new WriteAgentKnowledgeChunkCommand({
                        xpertId,
                        agentKey,
                        knowledgebaseIds,
                        knowledgebaseId: targetKnowledgebaseId,
                        text: input.text,
                        title: input.title,
                        metadata: input.metadata,
                        writeKey,
                        executionId: runtimeContext.executionId,
                        threadId: runtimeContext.threadId
                    })
                )
            },
            {
                name: WRITE_KNOWLEDGE_CHUNK_TOOL,
                description: 'Append a text chunk into one of the knowledgebases connected to the current agent.',
                schema
            }
        )
    }

    private readRuntimeContext(config: unknown) {
        if (!config || typeof config !== 'object' || !('configurable' in config)) {
            return {}
        }

        const configurable = config.configurable
        if (!configurable || typeof configurable !== 'object') {
            return {}
        }

        const executionId =
            'executionId' in configurable && typeof configurable.executionId === 'string'
                ? configurable.executionId
                : undefined
        const threadId =
            'thread_id' in configurable && typeof configurable.thread_id === 'string'
                ? configurable.thread_id
                : undefined

        return {
            executionId,
            threadId
        }
    }

    private createFallbackWriteKey(
        executionId: string | undefined,
        knowledgebaseId: string,
        title: string | undefined,
        text: string
    ) {
        const hash = createHash('sha1')
            .update([executionId ?? 'preview', knowledgebaseId, title ?? '', text].join('\n'))
            .digest('hex')

        return executionId ? `${executionId}:${hash}` : `preview:${hash}`
    }

    private resolveWriteInput(parameters: unknown): TMultiKnowledgebaseWriteInput {
        if (this.isMultiKnowledgebaseWriteInput(parameters) || this.isBaseWriteInput(parameters)) {
            return parameters
        }

        throw new Error('Invalid write_knowledge_chunk parameters')
    }

    private isBaseWriteInput(value: unknown): value is TBaseWriteInput {
        if (!value || typeof value !== 'object') {
            return false
        }

        if (!('text' in value) || typeof value.text !== 'string' || !value.text.length) {
            return false
        }

        if ('title' in value && value.title !== undefined && typeof value.title !== 'string') {
            return false
        }

        if ('metadata' in value && value.metadata !== undefined && !this.isMetadataObject(value.metadata)) {
            return false
        }

        return true
    }

    private isMultiKnowledgebaseWriteInput(value: unknown): value is TMultiKnowledgebaseWriteInput {
        return (
            this.isBaseWriteInput(value) &&
            'knowledgebaseId' in value &&
            typeof value.knowledgebaseId === 'string' &&
            value.knowledgebaseId.length > 0
        )
    }

    private isMetadataObject(value: unknown): value is TAgentKnowledgeChunkInputMetadata {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            return false
        }

        return Object.values(value).every((item) => this.isJsonValue(item))
    }

    private isJsonValue(value: unknown): value is JsonValue {
        if (value === null) {
            return true
        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return true
        }

        if (Array.isArray(value)) {
            return value.every((item) => this.isJsonValue(item))
        }

        if (typeof value === 'object') {
            return Object.values(value).every((item) => this.isJsonValue(item))
        }

        return false
    }
}
