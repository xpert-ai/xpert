import { splitStreamingMarkdown } from './streaming-markdown'

describe('splitStreamingMarkdown', () => {
  it('does not freeze paragraph breaks inside a streaming fenced code block', () => {
    const text = [
      'intro',
      '',
      '```python',
      'import numpy as np',
      'import matplotlib.pyplot as plt',
      '',
      'def plot_lissajous(a, b, delta=0):',
      '    pass',
      '```'
    ].join('\n')

    expect(splitStreamingMarkdown(text)).toEqual({
      frozenBlocks: ['intro'],
      frozenText: 'intro\n\n',
      streaming: text.slice('intro\n\n'.length)
    })
  })

  it('keeps freezing completed plain markdown paragraphs while streaming', () => {
    const text = ['first paragraph', '', 'second paragraph', '', 'third paragraph'].join('\n')

    expect(splitStreamingMarkdown(text)).toEqual({
      frozenBlocks: ['first paragraph', 'second paragraph'],
      frozenText: 'first paragraph\n\nsecond paragraph\n\n',
      streaming: 'third paragraph'
    })
  })

  it('freezes a completed fenced code block before the next paragraph', () => {
    const codeBlock = ['```python', 'import numpy as np', '', 'print(np.pi)', '```'].join('\n')
    const text = ['intro', '', codeBlock, '', 'summary'].join('\n')

    expect(splitStreamingMarkdown(text)).toEqual({
      frozenBlocks: ['intro', codeBlock],
      frozenText: `intro\n\n${codeBlock}\n\n`,
      streaming: 'summary'
    })
  })
})
