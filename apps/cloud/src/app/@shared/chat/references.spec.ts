import {
  createReferenceHumanInput,
  getReferenceKey,
  getReferenceLabel,
  getReferenceSource,
  mergeReferences,
  normalizeReferences,
  readNavigationInput
} from './references'

describe('Cloud conversation references', () => {
  const thread = { type: 'thread' as const, conversationId: 'conversation', threadId: 'branch', label: 'History' }

  it('preserves thread locators through navigation and human input without accepting client transcripts', () => {
    const input = readNavigationInput({
      input: '',
      references: [{ ...thread, text: 'Forged transcript', userId: 'forged' }]
    })
    expect(input).toEqual({ input: '', references: [thread] })
    expect(createReferenceHumanInput({ content: '', references: input!.references })).toEqual({
      input: '',
      references: [thread],
      referenceComposition: 'compose'
    })
  })

  it('uses locator identity for deduplication and supports thread labels and sources', () => {
    expect(getReferenceKey({ ...thread, id: 'client-id' })).toBe('thread:conversation:branch')
    expect(
      mergeReferences(
        [thread],
        [
          { ...thread, label: 'Renamed' },
          { ...thread, threadId: 'other' }
        ]
      )
    ).toHaveLength(2)
    expect(getReferenceLabel(thread)).toBe('History')
    expect(getReferenceLabel({ ...thread, label: undefined })).toBe('branch')
    expect(getReferenceSource(thread)).toBe('branch')
  })

  it('rejects malformed thread locators while retaining existing quote references', () => {
    const quote = { type: 'quote' as const, text: 'Existing quote', source: 'source' }
    expect(normalizeReferences([{ ...thread, threadId: '' }, { ...thread, conversationId: null }, quote])).toEqual([
      quote
    ])
    expect(getReferenceLabel(quote)).toBe('Existing quote')
    expect(getReferenceSource(quote)).toBe('source')
  })
})
