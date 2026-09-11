import type { PptxDeck } from './pptx-file.utils'
import { cloneDeck } from './pptx-editor-model.utils'

type PptxHistoryEntry = {
  deck: PptxDeck
  revision: number
}

export class PptxEditHistory {
  #history: PptxHistoryEntry[] = []
  #future: PptxHistoryEntry[] = []
  #revision = 0
  #savedRevision = 0
  #nextRevision = 1

  get canUndo() {
    return this.#history.length > 0
  }

  get canRedo() {
    return this.#future.length > 0
  }

  get dirty() {
    return this.#revision !== this.#savedRevision
  }

  push(deck: PptxDeck) {
    this.#history.push({ deck: cloneDeck(deck), revision: this.#revision })
    if (this.#history.length > 50) this.#history.shift()
    this.#future = []
    this.#revision = this.#nextRevision++
  }

  undo(current: PptxDeck) {
    const previous = this.#history.pop()
    if (!previous) return null
    this.#future.push({ deck: cloneDeck(current), revision: this.#revision })
    this.#revision = previous.revision
    return previous.deck
  }

  redo(current: PptxDeck) {
    const next = this.#future.pop()
    if (!next) return null
    this.#history.push({ deck: cloneDeck(current), revision: this.#revision })
    this.#revision = next.revision
    return next.deck
  }

  markSaved() {
    this.#savedRevision = this.#revision
  }

  reset() {
    this.#history = []
    this.#future = []
    this.#revision = 0
    this.#savedRevision = 0
    this.#nextRevision = 1
  }
}
