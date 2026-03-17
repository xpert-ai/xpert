import { marked } from 'marked'
import { markedOptionsFactory } from './markdown'

describe('markedOptionsFactory', () => {
  it('returns synchronous marked output for ngx-markdown compatibility', () => {
    const parsed = marked.parse('Reasoning content', markedOptionsFactory())

    expect(typeof parsed).toBe('string')
    expect(parsed).toContain('<p>Reasoning content</p>')
  })

  it('keeps custom code block rendering synchronous', () => {
    const parsed = marked.parse('```mermaid\nA-->B\n```', markedOptionsFactory())

    expect(typeof parsed).toBe('string')
    expect(parsed).toContain('<mermaid-wrapper')
  })
})
