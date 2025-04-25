import { WritableSignal, effect } from '@angular/core'
import { FormControl } from '@angular/forms'
import { distinctUntilChanged, startWith } from 'rxjs'

export function bindFormControlToSignal<T = any>(
  formControl: FormControl,
  signal: WritableSignal<T>
) {
  // Sync formControl → signal
  const sub = formControl.valueChanges
    .pipe(startWith(formControl.value), distinctUntilChanged())
    .subscribe((val) => {
      // Avoid unnecessary updates
      if (val !== signal()) {
        signal.set(val)
      }
    })

  // Sync signal → formControl
  effect(() => {
    const current = signal()
    if (formControl.value !== current) {
      formControl.setValue(current) // prevent loop
    }
  })

  // Optional: return unsubscribe function
  return () => sub.unsubscribe()
}
