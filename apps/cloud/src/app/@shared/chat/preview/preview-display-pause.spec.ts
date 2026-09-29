import { IChatMessage } from '@cloud/app/@core'
import { applyDisplayPauseSnapshot } from './preview-display-pause'

describe('applyDisplayPauseSnapshot', () => {
  const visibleMessages: IChatMessage[] = [
    { id: 'human-1', role: 'human', content: 'hello', parentId: null },
    { id: 'ai-1', role: 'ai', content: 'sandbox answer', parentId: 'human-1' },
    { id: 'human-2', role: 'human', content: 'later edit', parentId: 'ai-1' }
  ]

  it('keeps thread messages when the snapshot is missing or invalid', () => {
    expect(applyDisplayPauseSnapshot(visibleMessages, null)).toEqual(visibleMessages)
    expect(applyDisplayPauseSnapshot(visibleMessages, '{')).toEqual(visibleMessages)
    expect(applyDisplayPauseSnapshot(visibleMessages, JSON.stringify({ version: 2, messages: [] }))).toEqual(
      visibleMessages
    )
  })

  it('keeps snapshot order and drops messages outside the paused display', () => {
    const actual = applyDisplayPauseSnapshot(
      visibleMessages,
      JSON.stringify({
        version: 1,
        messages: [
          { id: 'human-1', type: 'human', content: 'hello' },
          { id: 'ai-1', type: 'ai', content: 'frozen sandbox', status: 'success' }
        ]
      })
    )

    expect(actual.map((message) => message.id)).toEqual(['human-1', 'ai-1'])
    expect(actual[1]?.content).toBe('frozen sandbox')
    expect(actual[1]?.status).toBe('success')
    expect(actual[1]?.parentId).toBe('human-1')
  })
})
