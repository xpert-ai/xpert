import type { PptxDeck } from './pptx-file.utils'
import { PptxEditHistory } from './pptx-editor-history.utils'

describe('PptxEditHistory', () => {
  it('tracks whether undo and redo match the saved revision', () => {
    const original: PptxDeck = { width: 100, height: 60, slides: [] }
    const edited: PptxDeck = { width: 120, height: 60, slides: [] }
    const history = new PptxEditHistory()

    history.push(original)
    expect(history.dirty).toBe(true)
    expect(history.undo(edited)).toEqual(original)
    expect(history.dirty).toBe(false)

    expect(history.redo(original)).toEqual(edited)
    history.markSaved()
    expect(history.dirty).toBe(false)
    expect(history.undo(edited)).toEqual(original)
    expect(history.dirty).toBe(true)
    expect(history.redo(original)).toEqual(edited)
    expect(history.dirty).toBe(false)
  })
})
