import { getBusyComposerFollowUpMode, getPendingFollowUpText, readFollowUpBehaviorStorageValue } from './follow-ups'

describe('chat follow-up helpers', () => {
  it('defaults unknown persisted behavior to queue', () => {
    expect(readFollowUpBehaviorStorageValue(null)).toBe('queue')
    expect(readFollowUpBehaviorStorageValue('steer')).toBe('steer')
    expect(readFollowUpBehaviorStorageValue('queue')).toBe('queue')
  })

  it('maps busy composer shortcuts to ChatKit follow-up modes', () => {
    expect(getBusyComposerFollowUpMode({ metaKey: false, ctrlKey: false })).toBe('steer')
    expect(getBusyComposerFollowUpMode({ metaKey: true, ctrlKey: false })).toBe('queue')
    expect(getBusyComposerFollowUpMode({ metaKey: false, ctrlKey: true })).toBe('queue')
  })

  it('uses a reference label for reference-only pending follow-ups', () => {
    expect(
      getPendingFollowUpText(
        {
          mode: 'queue',
          references: [
            {
              type: 'quote',
              text: 'Referenced source text'
            }
          ]
        },
        'Referenced content'
      )
    ).toBe('Referenced source text')
  })
})
