import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import { Component, effect, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmDensityDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TI18N } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'

export type TStep = {
  title: TI18N | string
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkListboxModule,
    NgmI18nPipe
  ],
  selector: 'ngm-stepper',
  templateUrl: 'stepper.component.html',
  styleUrls: ['stepper.component.scss'],
  hostDirectives: [
    NgxControlValueAccessor,
    {
        directive: NgmDensityDirective,
        inputs: [ 'small', 'large' ]
    }
  ]
})
export class NgmStepperComponent {
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
    }, { allowSignalWrites: true})
  }

  onChange(index: number) {
    this.cva.writeValue(index)
  }
}