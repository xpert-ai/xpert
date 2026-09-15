import { createInkShape } from './pptx-editor-model.utils'
import type { PptxDeck } from './pptx-file.utils'

describe('createInkShape', () => {
  const deck = { width: 12192000, height: 6858000, slides: [] } as PptxDeck

  it('keeps ribbon pixel widths visible in the EMU-based slide model', () => {
    const shape = createInkShape(
      [
        { x: 1000000, y: 1000000 },
        { x: 3000000, y: 1800000 }
      ],
      'pen',
      70000,
      '#2563eb',
      deck
    )!

    const svg = atob(shape.imageSrc!.split(',')[1]!)
    expect(svg).toContain('stroke-width="70000"')
    expect(shape.width).toBeGreaterThan(2000000)
  })

  it('renders a single click as a visible dot', () => {
    const shape = createInkShape([{ x: 1000000, y: 1000000 }], 'pen', 70000, '#2563eb', deck)!
    const svg = atob(shape.imageSrc!.split(',')[1]!)
    expect(svg).toContain('stroke-width="70000"')
    expect(svg.match(/points="[^"]+/)?.[0].split(' ').length).toBe(2)
  })
})
