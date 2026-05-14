import { Directive, ElementRef, EventEmitter, Input, OnDestroy, Output } from '@angular/core'
import { debounceTime, Subject } from 'rxjs'

const entriesMap = new WeakMap()

const ro = new ResizeObserver((entries) => {
  for (const entry of entries) {
    if (entriesMap.has(entry.target)) {
      const comp = entriesMap.get(entry.target)
      comp._resizeCallback(entry)
    }
  }
})

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
    ro.observe(target)

    this.resize$.pipe(debounceTime(this.debounceTime)).subscribe((event) => {
      this.resize.emit(event)
    })
  }

  _resizeCallback(entry) {
    this.resize$.next(entry)
  }

  ngOnDestroy() {
    const target = this.el.nativeElement
    ro.unobserve(target)
    entriesMap.delete(target)
  }
}
