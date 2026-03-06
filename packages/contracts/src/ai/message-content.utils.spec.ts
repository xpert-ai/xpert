import { CopilotChatMessage } from './chat-message.model'
import {
  appendMessageContent,
  appendMessagePlainText,
  createMessageAppendContextTracker,
  inferMessageAppendContext,
  resolveMessageAppendContext,
  TMessageAppendContext
} from './message-content.utils'

describe('message-content.utils', () => {
  it('normalizes string incoming into text content', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, 'hello')

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(1)
    expect(chunks[0].type).toBe('text')
    expect(chunks[0].text).toBe('hello')
  })

  it('merges string incoming without separator when source and stream are the same', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, 'hello', { source: 'chat_stream', streamId: 'stream-a' })
    appendMessageContent(message, ' world', { source: 'chat_stream', streamId: 'stream-a' })

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(1)
    expect(chunks[0].type).toBe('text')
    expect(chunks[0].id).toBe('stream-a')
    expect(chunks[0].text).toBe('hello world')
  })

  it('merges text chunks without separator when source and stream are the same', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, { type: 'text', id: 'stream-a', text: 'hello' } as any)
    appendMessageContent(message, { type: 'text', id: 'stream-a', text: ' world' } as any)

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toBe('hello world')
  })

  it('keeps append order when multiple text streams interleave', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, 'A1', { source: 'chat_stream', streamId: 'stream-a' })
    appendMessageContent(message, 'B1', { source: 'tool_stream', streamId: 'stream-b' })
    appendMessageContent(message, 'A2', { source: 'chat_stream', streamId: 'stream-a' })

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(3)
    expect(chunks[0].id).toBe('stream-a')
    expect(chunks[0].text).toBe('A1')
    expect(chunks[1].id).toBe('stream-b')
    expect(chunks[1].text).toBe('\nB1')
    expect(chunks[2].id).toBe('stream-a')
    expect(chunks[2].text).toBe('\nA2')
  })

  it('adds a line break when next text follows a closed code fence from another stream', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, { type: 'text', id: 'stream-a', text: '```ts\nconst n = 1\n```' } as any)
    appendMessageContent(message, { type: 'text', id: 'stream-b', text: 'next' } as any)

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(2)
    expect(chunks[1].text).toBe('\nnext')
  })

  it('separates text after component with paragraph break', () => {
    const message = { id: 'm1', role: 'ai', content: '' } as CopilotChatMessage

    appendMessageContent(message, { type: 'text', id: 'stream-a', text: 'intro' } as any)
    appendMessageContent(message, {
      id: 'tool-1',
      type: 'component',
      data: { category: 'Tool', type: 'task', status: 'running' }
    } as any)
    appendMessageContent(message, { type: 'text', id: 'stream-b', text: 'summary' } as any)

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(3)
    expect(chunks[2].text).toBe('\n\nsummary')
  })

  it('aggregates plain text output consistently with join hints', () => {
    let output = ''
    let lastContext: TMessageAppendContext | null = null
    const chunks = [
      { type: 'text', id: 'stream-a', text: 'a' },
      { type: 'text', id: 'stream-a', text: 'b' },
      { type: 'text', id: 'stream-b', text: 'c' }
    ] as any[]

    chunks.forEach((chunk) => {
      const context = inferMessageAppendContext(chunk, 'test')
      const messageContext =
        lastContext?.streamId && lastContext.source === context.source && lastContext.streamId === context.streamId
          ? { ...context, joinHint: 'none' as const }
          : context
      output = appendMessagePlainText(output, chunk, messageContext)
      lastContext = context
    })

    expect(output).toBe('ab\nc')
  })

  it('resolves append context with fallback stream id and same-stream join hint', () => {
    const previous = { source: 'chat_stream', streamId: 'stream-a' } as TMessageAppendContext
    const { appendContext, messageContext } = resolveMessageAppendContext({
      previous,
      incoming: 'next',
      fallbackSource: 'chat_stream',
      fallbackStreamId: 'stream-a'
    })

    expect(appendContext.source).toBe('chat_stream')
    expect(appendContext.streamId).toBe('stream-a')
    expect(messageContext.joinHint).toBe('none')
  })

  it('tracks previous context and can reset', () => {
    const tracker = createMessageAppendContextTracker()

    const first = tracker.resolve({
      incoming: 'hello',
      fallbackSource: 'chat_stream',
      fallbackStreamId: 'stream-a'
    })
    expect(first.messageContext.joinHint).toBeUndefined()
    expect(tracker.current()?.streamId).toBe('stream-a')

    const second = tracker.resolve({
      incoming: ' world',
      fallbackSource: 'chat_stream',
      fallbackStreamId: 'stream-a'
    })
    expect(second.messageContext.joinHint).toBe('none')

    tracker.reset()
    expect(tracker.current()).toBeNull()
  })

  it('updates component content by id without duplicating item', () => {
    const message = { id: 'm1', role: 'ai', content: [] } as CopilotChatMessage

    appendMessageContent(message, {
      id: 'tool-1',
      type: 'component',
      data: {
        category: 'Tool',
        type: 'task',
        status: 'running',
        created_date: '2026-01-01T00:00:00.000Z'
      }
    } as any)

    appendMessageContent(message, {
      id: 'tool-1',
      type: 'component',
      data: {
        category: 'Tool',
        type: 'task',
        status: 'success',
        output: 'ok',
        created_date: '2026-01-02T00:00:00.000Z'
      }
    } as any)

    const chunks = message.content as any[]
    expect(chunks).toHaveLength(1)
    expect(chunks[0].data.status).toBe('success')
    expect(chunks[0].data.output).toBe('ok')
    expect(chunks[0].data.created_date).toBe('2026-01-01T00:00:00.000Z')
  })

  it('merges reasoning chunks by id', () => {
    const message = { id: 'm1', role: 'ai', content: [] } as CopilotChatMessage

    appendMessageContent(message, { type: 'reasoning', id: 'r1', text: 'A' } as any)
    appendMessageContent(message, { type: 'reasoning', id: 'r1', text: 'B' } as any)

    expect(message.status).toBe('reasoning')
    expect(message.reasoning).toHaveLength(1)
    expect(message.reasoning[0].text).toBe('AB')
  })
})
