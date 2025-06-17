import { DestroyRef, inject, Injector, Pipe, PipeTransform, Signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { BehaviorSubject, interval, map, startWith, switchMap } from 'rxjs'

@Pipe({
  name: 'relativeTimes',
  standalone: true,
  pure: false // Non-pure pipeline, supports updates every second
})
export class RelativeTimesPipe implements PipeTransform {
  private destroyRef = inject(DestroyRef)
  private injector = inject(Injector)

  private period$ = new BehaviorSubject<number>(1000) // Default period of 1 second
  private now$: Signal<number> = toSignal(
    this.period$.pipe(
      switchMap((period) => interval(period)),
      startWith(0),
      map(() => Date.now())
    ),
    { initialValue: Date.now(), manualCleanup: true }
  )

  constructor() {
    this.destroyRef.onDestroy(() => {
      // Manually clean up the observables subscribed in now$
      (this.now$ as any).destroy?.()
    })
  }

  transform(value: Date | string | number, period: number): number | null {
    if (!value) return null

    const inputTime = new Date(value).getTime()
    if (isNaN(inputTime)) return null

    if (this.period$.value !== period) {
      this.period$.next(period)
    }

    const now = this.now$() // Get the current timestamp from signal
    return (Math.floor((now - inputTime) / this.period$.value) * this.period$.value) / 1000
  }
}
