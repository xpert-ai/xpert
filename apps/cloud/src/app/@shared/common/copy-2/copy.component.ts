import { Clipboard } from '@angular/cdk/clipboard'

import { Component, HostListener, inject, input, numberAttribute, signal } from '@angular/core'
import { effectAction } from '@xpert-ai/ocap-angular/core'
import { timer } from 'rxjs'
import { switchMap, tap } from 'rxjs/operators'

@Component({
  standalone: true,
  imports: [],
  selector: 'copy2',
  templateUrl: 'copy.component.html',
  styleUrls: ['copy.component.scss']
})
export class Copy2Component {
  readonly #clipboard = inject(Clipboard)

  // Inputs
  readonly content = input<string | object>()
  readonly timer = input<number, number | string>(3000, {
    transform: numberAttribute
  })

  // States
  readonly copied = signal(false)

  @HostListener('click')
  copy = effectAction((origin$) =>
    origin$.pipe(
      tap(() => {
        const content = this.content()
        this.#clipboard.copy(typeof content === 'string' ? content : JSON.stringify(content))
        this.copied.set(true)
      }),
      switchMap(() => timer(this.timer())),
      tap(() => this.copied.set(false))
    )
  )
}
