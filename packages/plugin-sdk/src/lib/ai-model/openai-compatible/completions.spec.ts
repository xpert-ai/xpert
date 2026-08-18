import { ChatOAICompatReasoningModel } from './completions'

class TestChatModel extends ChatOAICompatReasoningModel {
  convertDelta(delta: Record<string, unknown>, rawResponse: Record<string, unknown>, defaultRole?: string) {
    return this._convertCompletionsDeltaToBaseMessageChunk(
      delta,
      rawResponse as never,
      defaultRole as Parameters<ChatOAICompatReasoningModel['_convertCompletionsDeltaToBaseMessageChunk']>[2]
    )
  }

  convertMessage(message: Record<string, unknown>, rawResponse: Record<string, unknown>) {
    return this._convertCompletionsMessageToBaseMessage(message as never, rawResponse as never)
  }
}

describe('ChatOAICompatReasoningModel', () => {
  it('treats role-less completion deltas as assistant chunks', () => {
    const model = new TestChatModel({
      apiKey: 'test-key',
      model: 'test-model',
      configuration: { baseURL: 'https://example.test/v1' }
    })

    const chunk = model.convertDelta(
      { content: '' },
      { id: 'chunk-1', choices: [{ index: 0, delta: { content: '' } }] }
    )

    expect(chunk._getType()).toBe('ai')
  })

  it('treats a role-less non-stream completion as an assistant message', () => {
    const model = new TestChatModel({
      apiKey: 'test-key',
      model: 'test-model',
      configuration: { baseURL: 'https://example.test/v1' }
    })

    const message = model.convertMessage({ content: 'answer' }, { id: 'response-1', model: 'test-model', choices: [] })

    expect(message._getType()).toBe('ai')
    expect(message.content).toBe('answer')
  })
})
