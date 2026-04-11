import type {
  TMessageContent,
  TMessageContentComplex,
  TMessageContentComponent,
  TMessageContentReasoning,
  TMessageContentText
} from '@xpert-ai/chatkit-types'
import { CopilotChatMessage } from './chat-message.model'

export type TMessageJoinHint = 'none' | 'space' | 'line' | 'paragraph'

export type TMessageAppendContext = {
  source?: string
  streamId?: string
  joinHint?: TMessageJoinHint
}

export type TAppendMessageContentOptions = TMessageAppendContext & {
  previous?: TMessageAppendContext | null
}

export type TResolveMessageAppendContextOptions = {
  previous?: TMessageAppendContext | null
  incoming: string | TMessageContentComplex
  fallbackSource?: string
  fallbackStreamId?: string
}

export type TResolvedMessageAppendContext = {
  appendContext: TMessageAppendContext
  messageContext: TMessageAppendContext
}

export type TMessageAppendContextTracker = {
  resolve: (options: Omit<TResolveMessageAppendContextOptions, 'previous'>) => TResolvedMessageAppendContext
  reset: () => void
  current: () => TMessageAppendContext | null
}

function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined
}

function isTextContent(content: unknown): content is TMessageContentText {
  return !!content && typeof content === 'object' && (content as TMessageContentText).type === 'text'
}

function isReasoningContent(content: unknown): content is TMessageContentReasoning {
  return !!content && typeof content === 'object' && (content as TMessageContentReasoning).type === 'reasoning'
}

function isComponentContent(content: unknown): content is TMessageContentComponent {
  return !!content && typeof content === 'object' && (content as TMessageContentComponent).type === 'component'
}

function inferContentSource(content: string | TMessageContentComplex): string {
  if (typeof content === 'string') {
    return 'text'
  }

  switch (content?.type) {
    case 'text':
      return 'text'
    case 'reasoning':
      return 'reasoning'
    case 'component':
      return 'component'
    case 'memory':
      return 'memory'
    default:
      return 'content'
  }
}

function mapJoinHint(hint?: TMessageJoinHint): string {
  switch (hint) {
    case 'none':
      return ''
    case 'space':
      return ' '
    case 'line':
      return '\n'
    case 'paragraph':
      return '\n\n'
    default:
      return ''
  }
}

function endsWithCodeFence(text: string): boolean {
  const normalized = (text ?? '').replace(/[ \t]+$/g, '')
  return normalized.endsWith('```')
}

function shouldJoinWithoutSeparator(
  previous: TMessageAppendContext | null | undefined,
  current: TMessageAppendContext
): boolean {
  return !!previous?.streamId && previous.source === current.source && previous.streamId === current.streamId
}

function getSeparator(
  previousType: string | null,
  previousText: string,
  nextText: string,
  joinHint?: TMessageJoinHint
): string {
  if (!nextText || /^\s/.test(nextText)) {
    return ''
  }

  if (joinHint) {
    return mapJoinHint(joinHint)
  }

  if (previousType === 'component') {
    return '\n\n'
  }

  if (endsWithCodeFence(previousText)) {
    return '\n'
  }

  if (previousText && !/[\s\n]$/.test(previousText)) {
    return '\n'
  }

  return ''
}

function normalizeIncomingContent(
  content: string | TMessageContentComplex,
  context: TMessageAppendContext
): TMessageContentComplex {
  if (typeof content !== 'string') {
    return content
  }

  return {
    type: 'text',
    text: content,
    ...(context.streamId ? { id: context.streamId } : {})
  } as TMessageContentText
}

function ensureArrayContent(content: CopilotChatMessage['content']): TMessageContentComplex[] {
  if (Array.isArray(content)) {
    return content
  }

  if (typeof content === 'string' && content.length > 0) {
    return [
      {
        type: 'text',
        text: content
      } as TMessageContentText
    ]
  }

  return []
}

function stringifySingle(content: TMessageContentComplex): string {
  if (content.type === 'text') {
    return content.text
  }
  if (content.type === 'component') {
    return JSON.stringify(content.data)
  }
  return JSON.stringify(content)
}

function filterText(content: string | TMessageContentComplex): string {
  if (typeof content === 'string') {
    return content
  }
  if (content?.type === 'text') {
    return content.text
  }
  return ''
}

function mergeTextChunkForDisplay(previous: TMessageContentText, incoming: TMessageContentText): TMessageContentText {
  return {
    ...previous,
    text: `${previous.text}${incoming.text}`,
    ...(!previous.id && incoming.id ? { id: incoming.id } : {}),
    ...(!previous.agentKey && incoming.agentKey ? { agentKey: incoming.agentKey } : {}),
    ...(!previous.xpertName && incoming.xpertName ? { xpertName: incoming.xpertName } : {})
  }
}

function stripAutoDisplaySeparator(
  incoming: TMessageContentText,
  previousOriginal: TMessageContentComplex | null | undefined
): TMessageContentText {
  if (previousOriginal?.type === 'component' && incoming.text.startsWith('\n\n')) {
    return {
      ...incoming,
      text: incoming.text.slice(1)
    }
  }

  return incoming
}

function mergeComponentData(previous: TMessageContentComponent, incoming: TMessageContentComponent) {
  const mergedIncomingData = Object.entries(incoming.data ?? {}).reduce(
    (acc, [key, value]) => {
      if (!isNil(value)) {
        acc[key] = value
      }
      return acc
    },
    {} as Record<string, unknown>
  )

  return {
    ...previous,
    ...incoming,
    data: {
      ...(previous.data ?? {}),
      ...mergedIncomingData,
      created_date: previous.data?.created_date || incoming.data?.created_date
    }
  } as TMessageContentComponent
}

export function inferMessageAppendContext(
  content: string | TMessageContentComplex,
  fallbackSource?: string
): TMessageAppendContext {
  return {
    source: fallbackSource ?? inferContentSource(content),
    ...(typeof content !== 'string' && content?.id ? { streamId: String(content.id) } : {})
  }
}

export function resolveMessageAppendContext(
  options: TResolveMessageAppendContextOptions
): TResolvedMessageAppendContext {
  const inferredContext = inferMessageAppendContext(options.incoming, options.fallbackSource)
  const appendContext =
    typeof options.incoming === 'string' && !inferredContext.streamId && options.fallbackStreamId
      ? { ...inferredContext, streamId: options.fallbackStreamId }
      : inferredContext

  const messageContext = shouldJoinWithoutSeparator(options.previous, appendContext)
    ? { ...appendContext, joinHint: 'none' as const }
    : appendContext

  return {
    appendContext,
    messageContext
  }
}

/**
 * Stateful helper for streaming append.
 *
 * It keeps the previous append context and resolves the current one, so callers
 * can avoid passing `previous` manually for every chunk and still get stable
 * join behavior (for example, same source + same stream -> `joinHint: 'none'`).
 *
 * Call `reset()` at turn/session boundaries to prevent cross-turn contamination.
 */
export function createMessageAppendContextTracker(
  initial: TMessageAppendContext | null = null
): TMessageAppendContextTracker {
  let previous = initial

  return {
    resolve(options) {
      const resolved = resolveMessageAppendContext({
        ...options,
        previous
      })
      previous = resolved.appendContext
      return resolved
    },
    reset() {
      previous = null
    },
    current() {
      return previous
    }
  }
}

/**
 * Append one incoming chunk into a chat message in place.
 *
 * Behavior:
 * - Keeps `aiMessage` object reference stable (caller may hold this object).
 * - Updates message properties with new references (`content`/`reasoning` arrays)
 *   so UI change detection that relies on reference changes can react reliably.
 * - Applies context-aware merge rules for text/reasoning/component chunks.
 * - `previous` must be supplied by caller when same-stream join inference is needed.
 */
export function appendMessageContent(
  aiMessage: CopilotChatMessage,
  incoming: string | TMessageContentComplex,
  context?: TAppendMessageContentOptions
) {
  aiMessage.status = 'answering'
  const { previous: _previous, ...contextWithoutPrevious } = context ?? {}
  const resolvedContext = {
    ...inferMessageAppendContext(incoming),
    ...contextWithoutPrevious
  } as TMessageAppendContext
  const content = normalizeIncomingContent(incoming, resolvedContext)

  if (isReasoningContent(content)) {
    const reasoning = aiMessage.reasoning ?? []
    const lastReasoning = reasoning[reasoning.length - 1]
    if (lastReasoning?.id === content.id) {
      const mergedReasoning = {
        ...lastReasoning,
        text: `${lastReasoning.text}${content.text}`
      } as TMessageContentReasoning
      aiMessage.reasoning = [...reasoning.slice(0, reasoning.length - 1), mergedReasoning]
    } else {
      aiMessage.reasoning = [...reasoning, content]
    }
    aiMessage.status = 'reasoning'
    return
  }

  const chunks = ensureArrayContent(aiMessage.content)

  if (isTextContent(content)) {
    if (content.id) {
      const index = chunks.findIndex((item) => isTextContent(item) && item.id === content.id)
      if (index > -1) {
        const mergedContent = {
          ...chunks[index],
          text: `${(chunks[index] as TMessageContentText).text}${content.text}`,
          ...(!(chunks[index] as TMessageContentText).id && content.id ? { id: content.id } : {}),
          ...(!(chunks[index] as TMessageContentText).agentKey && content.agentKey
            ? { agentKey: content.agentKey }
            : {}),
          ...(!(chunks[index] as TMessageContentText).xpertName && content.xpertName
            ? { xpertName: content.xpertName }
            : {})
        } as TMessageContentText
        aiMessage.content = [...chunks.slice(0, index), mergedContent, ...chunks.slice(index + 1)]
        return
      }
    }

    const lastContent = chunks[chunks.length - 1]

    // When the incoming chunk has an id (streamId), search backward for an existing
    // chunk with the same id so that interleaved concurrent streams (A→B→A) are
    // merged into the correct segment rather than appended as new fragments.
    if (!!content.id) {
      const existingIndex = chunks.findLastIndex(
        (c) => isTextContent(c) && (c as TMessageContentText).id === content.id
      )
      if (existingIndex > -1) {
        const existing = chunks[existingIndex] as TMessageContentText
        const merged = { ...existing, text: `${existing.text}${content.text}` } as TMessageContentText
        const nextChunks = [...chunks]
        nextChunks[existingIndex] = merged
        aiMessage.content = nextChunks
        return
      }
    } else if (isTextContent(lastContent) && joinHint === 'none') {
      const mergedLastContent = {
        ...lastContent,
        text: `${lastContent.text}${content.text}`
      } as TMessageContentText
      aiMessage.content = [...chunks.slice(0, chunks.length - 1), mergedLastContent]
      return
    }

    aiMessage.content = [...chunks, content]
    return
  }

  const nextChunks = [...chunks]
  if (isComponentContent(content) && content.id) {
    const index = nextChunks.findIndex((item) => isComponentContent(item) && item.id === content.id)
    if (index > -1) {
      nextChunks[index] = mergeComponentData(nextChunks[index] as TMessageContentComponent, content)
    } else {
      nextChunks.push(content)
    }
  } else {
    nextChunks.push(content)
  }

  aiMessage.content = nextChunks
}

export function appendMessagePlainText(
  accumulator: string,
  incoming: string | TMessageContentComplex,
  context?: TMessageAppendContext
): string {
  const resolvedContext = {
    ...inferMessageAppendContext(incoming),
    ...(context ?? {})
  } as TMessageAppendContext
  const nextText = filterText(incoming)
  if (!nextText) {
    return accumulator ?? ''
  }

  const previous = accumulator ?? ''
  const separator = getSeparator('text', previous, nextText, resolvedContext.joinHint)
  return previous + separator + nextText
}

/**
 * Creates a display-only content view that reassembles text chunks belonging to
 * the same stream id. This preserves markdown continuity without changing the
 * underlying stored/streamed message structure.
 */
export function mergeMessageContentForDisplay(
  content: TMessageContent | TMessageContentComplex | null | undefined
): TMessageContentComplex[] | null {
  if (!content) {
    return null
  }

  if (typeof content === 'string') {
    return content.length
      ? ([
          {
            type: 'text',
            text: content
          } as TMessageContentText
        ] as TMessageContentComplex[])
      : null
  }

  if (!Array.isArray(content)) {
    return [content]
  }

  const merged: TMessageContentComplex[] = []
  const textIndexById = new Map<string, number>()

  content.forEach((item, itemIndex) => {
    if (!isTextContent(item)) {
      merged.push(item)
      return
    }

    if (item.id) {
      const mergedIndex = textIndexById.get(item.id)
      if (mergedIndex !== undefined && isTextContent(merged[mergedIndex])) {
        const previousOriginal = content[itemIndex - 1]
        merged[mergedIndex] = mergeTextChunkForDisplay(
          merged[mergedIndex] as TMessageContentText,
          stripAutoDisplaySeparator(item, previousOriginal)
        )
        return
      }

      textIndexById.set(item.id, merged.length)
      merged.push({ ...item })
      return
    }

    const lastItem = merged[merged.length - 1]
    if (
      isTextContent(lastItem) &&
      !lastItem.id &&
      lastItem.agentKey === item.agentKey &&
      lastItem.xpertName === item.xpertName
    ) {
      merged[merged.length - 1] = mergeTextChunkForDisplay(lastItem, item)
      return
    }

    merged.push({ ...item })
  })

  return merged.length ? merged : null
}

export function stringifyMessageContent(content: TMessageContent | TMessageContentComplex) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    let result = ''
    let previousContext: TMessageAppendContext = null
    content.forEach((item) => {
      const itemContext = inferMessageAppendContext(item)
      const joinHint = shouldJoinWithoutSeparator(previousContext, itemContext) ? 'none' : undefined
      result = appendMessagePlainText(result, stringifySingle(item), {
        ...itemContext,
        ...(joinHint ? { joinHint } : {})
      })
      previousContext = itemContext
    })
    return result
  }

  return stringifySingle(content)
}

export function filterMessageText(content: TMessageContent | TMessageContentComplex) {
  if (typeof content === 'string') {
    return content
  }

  if (Array.isArray(content)) {
    let result = ''
    let previousContext: TMessageAppendContext = null
    content.forEach((item) => {
      const nextText = filterText(item)
      if (!nextText) {
        return
      }
      const itemContext = inferMessageAppendContext(item)
      const joinHint = shouldJoinWithoutSeparator(previousContext, itemContext) ? 'none' : undefined
      result = appendMessagePlainText(result, nextText, {
        ...itemContext,
        ...(joinHint ? { joinHint } : {})
      })
      previousContext = itemContext
    })
    return result || null
  }

  return filterText(content) || null
}
