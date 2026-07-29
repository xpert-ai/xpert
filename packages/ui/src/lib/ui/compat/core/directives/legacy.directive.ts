import {
  Directive,
  ElementRef,
  HostBinding,
  HostListener,
  Renderer2,
  effect,
  inject,
  input,
  numberAttribute,
  output,
  signal
} from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { ResizeObserverService, WaResizeObserver } from '@ng-web-apis/resize-observer'
import { Observable } from 'rxjs'

@Directive({
  standalone: true,
  selector: '[xpDnd]'
})
export class XpDndDirective {
  @HostBinding('class.xp-fileover') fileOver = false
  readonly fileDropped = output<FileList>()

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.fileOver = true
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.fileOver = false
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent) {
    event.preventDefault()
    event.stopPropagation()
    this.fileOver = false
    const files = event.dataTransfer?.files
    if (files?.length) {
      this.fileDropped.emit(files)
    }
  }
}

@Directive({
  standalone: true,
  selector: '[xpDynamicGrid]',
  hostDirectives: [
    {
      directive: WaResizeObserver,
      inputs: ['box'],
      outputs: ['waResizeObserver']
    }
  ]
})
export class XpDynamicGridDirective {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly renderer = inject(Renderer2)
  private readonly entries$ = inject(ResizeObserverService)

  private readonly elementWidth = signal(0)
  readonly colWidth = input<number, string | number>(200, { transform: numberAttribute })

  constructor() {
    effect(() => {
      const columns = Math.max(1, Math.floor(this.elementWidth() / this.colWidth()))
      this.renderer.setStyle(this.element.nativeElement, 'display', 'grid')
      this.renderer.setStyle(this.element.nativeElement, 'grid-template-columns', `repeat(${columns}, 1fr)`)
    })

    this.entries$.pipe(takeUntilDestroyed()).subscribe((entries) => {
      const entry = entries[0]
      const width = entry?.contentBoxSize?.[0]?.inlineSize ?? entry?.contentRect.width ?? 0
      this.elementWidth.set(width)
    })
  }
}

export interface IsDirty {
  isDirty(): boolean
  /** @deprecated Use `isDirty()` instead. */
  isDirty$?: Observable<boolean> | boolean | (() => boolean)
}
