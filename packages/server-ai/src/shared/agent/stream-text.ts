import { isAIMessage, isBaseMessage, type MessageContent, type MessageContentComplex } from '@langchain/core/messages'
import { RunnableLambda, type RunnableConfig } from '@langchain/core/runnables'
import { TMessageContentText } from '@xpert-ai/contracts'

type TTextMessageContentPart = MessageContentComplex & {
    type: 'text' | 'text_delta'
    text: string
}

export interface IStreamTextChunk extends TMessageContentText {
    id?: string
    agentKey?: string
    xpertName?: string
    executionId?: string
    parentExecutionId?: string
    runId?: string
    created_date?: Date
}

export interface ICreateTextChunkOptions {
    streamId?: string
    agentKey?: string
    xpertName?: string
    executionId?: string
    parentExecutionId?: string
    runId?: string
    createdDate?: Date
}

function isTextMessageContentPart(part: MessageContentComplex): part is TTextMessageContentPart {
    return (
        typeof part === 'object' &&
        part !== null &&
        'type' in part &&
        (part.type === 'text' || part.type === 'text_delta') &&
        'text' in part &&
        typeof part.text === 'string'
    )
}

export function extractTextFromMessageContent(content: MessageContent | null | undefined): string {
    if (typeof content === 'string') {
        return content
    }
    if (!Array.isArray(content)) {
        return ''
    }

    return content
        .filter(isTextMessageContentPart)
        .map((item) => item.text)
        .join('')
}

/**
 * When middleware answers directly, emit its AI reply as a single chunk on the current run's stream.
 * Only replies with content and no tool calls are eligible.
 */
export async function streamMiddlewareReply(message: unknown, config?: RunnableConfig): Promise<void> {
    if (!isBaseMessage(message) || !isAIMessage(message) || !message.content || message.tool_calls?.length) return

    // Draining the runnable emits the reply through LangChain's normal stream callbacks.
    const stream = await RunnableLambda.from(() => message).stream(null, config)
    await stream.pipeTo(new WritableStream())
}

export function createTextChunk(
    content: MessageContent | null | undefined,
    options: ICreateTextChunkOptions = {}
): IStreamTextChunk | null {
    const text = extractTextFromMessageContent(content)
    if (!text) {
        return null
    }

    const chunk: IStreamTextChunk = {
        type: 'text',
        text,
        created_date: options.createdDate ?? new Date()
    }

    if (options.streamId) {
        chunk.id = options.streamId
    }
    if (options.agentKey) {
        chunk.agentKey = options.agentKey
    }
    if (options.xpertName) {
        chunk.xpertName = options.xpertName
    }
    if (options.executionId) {
        chunk.executionId = options.executionId
    }
    if (options.parentExecutionId) {
        chunk.parentExecutionId = options.parentExecutionId
    }
    if (options.runId) {
        chunk.runId = options.runId
    }

    return chunk
}
