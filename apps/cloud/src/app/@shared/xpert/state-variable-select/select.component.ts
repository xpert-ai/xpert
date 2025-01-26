import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TStateVariable } from '../../../@core/types'
import { NgmSelectComponent } from '../../common'

/**
 *
 */
@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmSelectComponent],
  selector: 'xpert-state-variable-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class StateVariableSelectComponent {
  protected cva = inject<NgxControlValueAccessor<any>>(NgxControlValueAccessor)

  readonly variables = input<TStateVariable[]>()

  readonly selectOptions = computed(() =>
    this.variables()?.map((va) => ({
      value: va.name,
      label: va.description || va.name
    }))
  )

  readonly value$ = this.cva.value$

  readonly variableType = computed(() => this.variables()?.find((_) => _.name === this.value$())?.type)
}
