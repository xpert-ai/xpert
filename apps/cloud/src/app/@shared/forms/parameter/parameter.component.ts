
import { booleanAttribute, Component, computed, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { NgmCheckboxComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { ParameterTypeEnum, TParameter } from '../../../@core/types'
import { NgmSelectComponent } from '../../common'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 */
@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
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
  readonly required = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly type = computed(() => this.schema().type)
  readonly help = computed(() => this.schema().help)

  readonly value$ = this.cva.value$
}
