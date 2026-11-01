import type { IXpert, TXpertOpenerQuestion } from '@xpert-ai/contracts'
import { buildXpertStartScreen } from './xpert-start-screen'

function assistant(questions: TXpertOpenerQuestion[]): IXpert {
  return { features: { opener: { enabled: true, message: 'Welcome', questions } } } as IXpert
}

describe('configured opener labels and messages', () => {
  it('shows a short label and preserves the complete multiline instruction verbatim', () => {
    const prompt = 'Read the recipe.\n  Keep project scope and demo labels.\nSave a draft; do not publish.  '
    expect(buildXpertStartScreen(assistant([{ label: 'Regional sales · Beginner', prompt }]))?.prompts).toEqual([
      { label: 'Regional sales · Beginner', prompt }
    ])
  })

  it('deduplicates by message, not label, keeping the configured label before automatic suggestions', () => {
    expect(
      buildXpertStartScreen(
        assistant([
          { label: 'Sales', prompt: 'Build regional sales' },
          { label: 'Sales', prompt: 'Build sales overview' }
        ]),
        ['BUILD   REGIONAL SALES', 'Other task']
      )?.prompts
    ).toEqual([
      { label: 'Sales', prompt: 'Build regional sales' },
      { label: 'Sales', prompt: 'Build sales overview' },
      { label: 'Other task', prompt: 'Other task' }
    ])
  })

  it('supports plain questions and falls back to the full message for empty labels', () => {
    expect(
      buildXpertStartScreen(
        assistant(['  Hello  ', { label: ' ', prompt: 'Full message' }, { label: 'Empty', prompt: ' ' }])
      )?.prompts
    ).toEqual([
      { label: 'Hello', prompt: 'Hello' },
      { label: 'Full message', prompt: 'Full message' }
    ])
  })
})
