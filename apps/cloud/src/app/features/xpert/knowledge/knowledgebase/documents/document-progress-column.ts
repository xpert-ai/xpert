import { afterNextRender, DestroyRef, Directive, ElementRef, inject, input, NgZone, signal } from '@angular/core'

/** Content minimums are transient: never overwrite the user's persisted column preferences. */
export class DocumentProgressColumnWidth {
  readonly #rows = new Map<Element, number>()
  readonly #minimum = signal(0)

  update(row: Element, width: number) {
    if (!Number.isFinite(width) || width < 0 || this.#rows.get(row) === width) return
    this.#rows.set(row, width)
    this.#refresh()
  }

  remove(row: Element) {
    this.#rows.delete(row)
    this.#refresh()
  }

  fit<T extends { key: string; width: number; minWidth: number }>(columns: T[]): T[] {
    const minimum = this.#minimum()
    return columns.map((column) =>
      column.key === 'progress'
        ? { ...column, width: Math.max(column.width, minimum), minWidth: Math.max(column.minWidth, minimum) }
        : column
    )
  }

  #refresh() {
    this.#minimum.set(Math.max(0, ...this.#rows.values()))
  }
}

@Directive({ selector: '[xpDocumentProgressWidth]', standalone: true })
export class DocumentProgressWidthDirective {
  readonly sizing = input.required<DocumentProgressColumnWidth>({ alias: 'xpDocumentProgressWidth' })
  readonly #element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
  readonly #zone = inject(NgZone)
  readonly #destroy = inject(DestroyRef)

  constructor() {
    afterNextRender(() => {
      const sizing = this.sizing()
      const element = this.#element
      const measure = () => {
        const cell = element.closest('td')
        if (!cell) return
        const style = getComputedStyle(cell)
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
        this.#zone.run(() => sizing.update(element, Math.ceil(element.scrollWidth + padding)))
      }
      // Observe max-content, not the cell: growing the column must not cause a measurement feedback loop.
      const observer = new ResizeObserver(measure)
      observer.observe(element)
      measure()
      this.#destroy.onDestroy(() => {
        observer.disconnect()
        // Do not resize an already-checked table while Angular is removing a row.
        queueMicrotask(() => sizing.remove(element))
      })
    })
  }
}
