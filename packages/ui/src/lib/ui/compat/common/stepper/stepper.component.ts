import { CdkListboxModule } from '@angular/cdk/listbox'

import { Component, effect, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpDensityDirective, XpI18nPipe } from '../../core'
import { TI18N } from '../../core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

export type TStep = {
  title: TI18N | string
}

@Component({
  standalone: true,
  imports: [FormsModule, TranslateModule, CdkListboxModule, XpI18nPipe],
  selector: 'xp-stepper',
  templateUrl: 'stepper.component.html',
  styleUrls: ['stepper.component.scss'],
  hostDirectives: [
    NgxControlValueAccessor,
    {
      directive: XpDensityDirective,
      inputs: ['small', 'large']
    }
  ]
})
export class XpStepperComponent {
  protected cva = inject<NgxControlValueAccessor<number>>(NgxControlValueAccessor)

  // Inputs
  readonly steps = input<TStep[]>()

  // States
  readonly current = model<number[]>([1])

  constructor() {
    effect(() => {
      if (this.cva.value$() != null && this.cva.value$() !== this.current()[0]) {
        this.current.set([this.cva.value$()])
      }
    })
  }

  onChange(index: number) {
    this.cva.writeValue(index)
  }
}
