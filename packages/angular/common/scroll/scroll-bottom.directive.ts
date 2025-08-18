import { Directive, effect, ElementRef, input, OnDestroy, OnInit, signal } from '@angular/core'

@Directive({
  selector: '[ngmAutoScrollBottom]',
  standalone: true
})
export class NgmAutoScrollBottomDirective implements OnInit, OnDestroy {
  private el: HTMLElement

  // Whether to follow to the bottom
  private autoFollow = signal(true)

  // User-configurable bottom threshold
  readonly bottomThreshold = input<number>(30)

  // Accepts a signal data source (e.g., messages: Signal<any[]>)
  readonly dataSource = input<unknown[]>()

  // Listen for data source changes
  private stopEffect = effect(() => {
    this.dataSource?.() // Read signal value to trigger effect
    if (this.autoFollow()) {
      this.scrollToBottom()
    }
  })

  constructor(el: ElementRef<HTMLElement>) {
    this.el = el.nativeElement
  }

  ngOnInit(): void {
    // Listen for user scroll behavior
    this.el.addEventListener('scroll', this.onScroll)
  }

  ngOnDestroy(): void {
    this.el.removeEventListener('scroll', this.onScroll)
  }

  private onScroll = () => {
    const distanceToBottom = this.el.scrollHeight - this.el.scrollTop - this.el.clientHeight
    if (distanceToBottom <= this.bottomThreshold()) {
      this.autoFollow.set(true)
    } else {
      this.autoFollow.set(false)
    }
  }

  private scrollToBottom() {
    this.el.scrollTop = this.el.scrollHeight
  }
}
