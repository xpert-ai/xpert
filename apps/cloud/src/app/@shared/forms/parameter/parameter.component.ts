import { CommonModule } from '@angular/common'
import { Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmCheckboxComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { ParameterTypeEnum, TParameter } from '../../../@core/types'
import { NgmSelectComponent } from '../../common'

/**
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmI18nPipe,
    NgmSelectComponent,
    NgmCheckboxComponent
  ],
  selector: 'parameter',
  templateUrl: 'parameter.component.html',
  styleUrls: ['parameter.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class ParameterComponent {
  eParameterTypeEnum = ParameterTypeEnum

  protected cva = inject<NgxControlValueAccessor<unknown>>(NgxControlValueAccessor)

  readonly schema = input<TParameter>()

  readonly type = computed(() => this.schema().type)

  readonly value$ = this.cva.value$
}
