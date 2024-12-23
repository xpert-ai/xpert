import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, effect, inject, input, model } from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ISelectOption, NgmDensityDirective } from '@metad/ocap-angular/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { CdkListboxModule } from '@angular/cdk/listbox'

@Component({
  standalone: true,
  selector: 'ngm-radio-select',
  templateUrl: `select.component.html`,
  styleUrls: [`select.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'ngm-radio-select',
    '[attr.disabled]': 'isDisabled || null'
  },
  hostDirectives: [
    {
      directive: NgmDensityDirective,
      inputs: ['small', 'large']
    },
    NgxControlValueAccessor
  ],
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CdkListboxModule]
})
export class NgmRadioSelectComponent {

  protected cva = inject<NgxControlValueAccessor<any | null>>(NgxControlValueAccessor)

  readonly options = input<ISelectOption[]>()

  readonly value = model(null)

  constructor() {
    effect(() => {
      if (this.cva.value$() && this.cva.value$() !== this.value()?.[0]) {
        this.value.set([this.cva.value$()])
      }
    }, { allowSignalWrites: true })

    effect(() => {
      if (this.value()) {
        this.cva.value$.set(this.value()[0])
      }
    }, { allowSignalWrites: true })

    // effect(() => {
    //   console.log(this.value())
    // })
  }
}
