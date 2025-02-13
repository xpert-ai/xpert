import { CommonModule } from '@angular/common'
import { Component, computed, input } from '@angular/core'
import { ReactiveFormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ParameterTypeEnum, TParameter } from '../../../@core/types'

/**
 */
@Component({
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, NgmI18nPipe],
  selector: 'parameter',
  templateUrl: 'parameter.component.html',
  styleUrls: ['parameter.component.scss']
})
export class ParameterComponent {
  eParameterTypeEnum = ParameterTypeEnum
  
  readonly schema = input<TParameter>()

  readonly type = computed(() => this.schema().type)
}
