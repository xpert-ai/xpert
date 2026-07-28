import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { TSelectOption, XpDensityDirective, XpI18nPipe } from '../../core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { ZardTooltipImports } from '../../../../components'
@Component({
  standalone: true,
  selector: 'xp-radio-select',
  templateUrl: `select.component.html`,
  styleUrls: [`select.component.scss`],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'xp-radio-select',
    '[attr.disabled]': 'isDisabled() || null',
    '[class.simple]': 'simple()'
  },
  hostDirectives: [
    {
      directive: XpDensityDirective,
      inputs: ['small', 'large']
    },
    NgxControlValueAccessor
  ],
  imports: [FormsModule, ReactiveFormsModule, CdkListboxModule, ...ZardTooltipImports, XpI18nPipe]
})
export class XpRadioSelectComponent {
  protected cva = inject<NgxControlValueAccessor<any | null>>(NgxControlValueAccessor)

  readonly selectOptions = input<TSelectOption[]>()
  readonly isDisabled = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly simple = input<boolean, string | boolean>(false, {
    transform: booleanAttribute
  })

  readonly options = computed(() =>
    this.selectOptions()?.map((option) => ({ ...option, key: option.key ?? option.value }))
  )

  readonly value = model(null)

  constructor() {
    effect(() => {
      if (this.cva.value$() && this.cva.value$() !== this.value()?.[0]) {
        this.value.set([this.cva.value$()])
      }
    })

    effect(() => {
      if (this.value()) {
        this.cva.value$.set(this.value()[0])
      }
    })

    // effect(() => {
    //   console.log(this.value())
    // })
  }
}
