import { Directive, ElementRef, Input, OnDestroy, OnInit, effect, input, signal } from '@angular/core'

@Directive({
  selector: '[ngmTimer]',
  standalone: true
})
export class NgmTimerDirective implements OnInit, OnDestroy {
  @Input('ngmTimer') startTime!: Date | string | number
  readonly stopTime = input<Date | string | number | null>(null)

  private elapsedSeconds = signal(0)
  private intervalId: any

  constructor(private el: ElementRef) {
    // Whenever elapsedSeconds changes, update DOM
    effect(() => {
      this.el.nativeElement.textContent = this.formatTime(this.elapsedSeconds())
    })
  }

  ngOnInit(): void {
    const startTimestamp = this.toTimestamp(this.startTime)

    this.intervalId = setInterval(() => {
      // If stopTime exists, freeze elapsedSeconds
      if (this.stopTime()) {
        const stopTimestamp = this.toTimestamp(this.stopTime())
        const diffSec = Math.floor((stopTimestamp - startTimestamp) / 1000)
        this.elapsedSeconds.set(diffSec)
      } else {
        const now = Date.now()
        const diffSec = Math.floor((now - startTimestamp) / 1000)
        this.elapsedSeconds.set(diffSec)
      }
    }, 1000)
  }

  ngOnDestroy(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
    }
  }

  private toTimestamp(value: Date | string | number | null | undefined): number {
    if (!value) return Date.now()
    if (value instanceof Date) return value.getTime()
    if (typeof value === 'string') return new Date(value).getTime()
    if (typeof value === 'number') return value
    return Date.now()
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return `${this.pad(hours)}:${this.pad(minutes)}:${this.pad(seconds)}`
  }

  private pad(num: number): string {
    return num < 10 ? `0${num}` : `${num}`
  }
}
