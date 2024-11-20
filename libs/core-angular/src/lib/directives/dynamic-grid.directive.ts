import { Directive, ElementRef, Renderer2, effect, inject, input, numberAttribute, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ResizeObserverService, WaResizeObserver } from '@ng-web-apis/resize-observer'
import { debounceTime } from 'rxjs'

/**
 * This directive dynamically adjusts the number of columns in a grid layout
 * based on the width of the host element. It uses the WaResizeObserver to
 * monitor changes in the element's size and recalculates the number of columns
 * that can fit within the current width.
 *
 * Example usage:
 * <div ngmDynamicGrid colWidth="280" box="content-box">
 *   <!-- Grid items here -->
 * </div>
 */
@Directive({
  standalone: true,
  selector: '[ngmDynamicGrid]',
  hostDirectives: [
    {
      directive: WaResizeObserver,
      inputs: ['box'],
      outputs: ['waResizeObserver']
    }
  ]
})
export class DynamicGridDirective {
  readonly entries$ = inject(ResizeObserverService)

  // Define a signal to store the element's width
  elementWidth = signal(0)

  readonly colWidth = input<number, string | number>(200, {
    transform: numberAttribute
  }) // Width of each column

  constructor(
    private el: ElementRef,
    private renderer: Renderer2
  ) {
    this.initializeSignalEffect()

    this.entries$.pipe(debounceTime(100), takeUntilDestroyed()).subscribe((entries) => {
      // This will trigger when the component resizes
      this.elementWidth.set(entries[0].contentBoxSize[0].inlineSize)
    })
  }

  private initializeSignalEffect() {
    // Create an effect to monitor changes in elementWidth
    effect(() => {
      const width = this.elementWidth()
      const cols = Math.max(1, Math.floor(width / this.colWidth()))

      // Apply native grid styles
      this.renderer.setStyle(this.el.nativeElement, 'display', 'grid')
      this.renderer.setStyle(this.el.nativeElement, 'grid-template-columns', `repeat(${cols}, 1fr)`)
    })
  }
}
