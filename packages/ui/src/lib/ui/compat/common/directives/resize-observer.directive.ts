import { Directive, ElementRef, EventEmitter, Input, OnDestroy, Output } from '@angular/core'
import { debounceTime, Subject } from 'rxjs'

const entriesMap = new WeakMap<Element, ResizeObserverDirective>()
let resizeObserver: ResizeObserver | undefined

function getResizeObserver(): ResizeObserver | undefined {
  if (!resizeObserver && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        entriesMap.get(entry.target)?._resizeCallback(entry)
      }
    })
  }

  return resizeObserver
}

@Directive({
  standalone: true,
  selector: '[resizeObserver]'
})
export class ResizeObserverDirective implements OnDestroy {
  @Input('resizeDebounceTime') debounceTime = 1000

  @Output()
  resize = new EventEmitter()

  private resize$ = new Subject()

  constructor(private el: ElementRef) {
    const target = this.el.nativeElement
    entriesMap.set(target, this)
    getResizeObserver()?.observe(target)

    this.resize$.pipe(debounceTime(this.debounceTime)).subscribe((event) => {
      this.resize.emit(event)
    })
  }

  _resizeCallback(entry) {
    this.resize$.next(entry)
  }

  ngOnDestroy() {
    const target = this.el.nativeElement
    resizeObserver?.unobserve(target)
    entriesMap.delete(target)
  }
}
