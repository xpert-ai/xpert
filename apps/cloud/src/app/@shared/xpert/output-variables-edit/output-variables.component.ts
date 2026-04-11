import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'

import { Component, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { linkedModel, TSelectOption } from '@xpert-ai/ocap-angular/core'
import { DisplayBehaviour } from '@xpert-ai/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TAgentOutputVariable, TXpertParameter, VariableOperations, XpertParameterTypeEnum } from '../../../@core'
import { XpertParameterInputComponent } from '../parameter-input/input.component'
import { XpertParameterMenuItemComponent } from '../parameter-menu/menu-item.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
@Component({
  standalone: true,
  selector: 'xpert-output-variables-edit',
  templateUrl: './output-variables.component.html',
  styleUrl: 'output-variables.component.scss',
  imports: [
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    DragDropModule,
    ...ZardTooltipImports,
    XpertParameterMenuItemComponent,
    XpertParameterInputComponent
],

  hostDirectives: [NgxControlValueAccessor]
})
export class XpertOutputVariablesEditComponent {
  eXpertParameterTypeEnum = XpertParameterTypeEnum
  eDisplayBehaviour = DisplayBehaviour

  protected cva = inject<NgxControlValueAccessor<Partial<TXpertParameter[]> | null>>(NgxControlValueAccessor)

  readonly value$ = this.cva.value$
  // Inputs
  readonly title = input<string>()

  readonly parameters = linkedModel({
    initialValue: null,
    compute: () => this.value$() ?? [],
    update: (value) => {
      this.cva.writeValue(value)
      return value
    }
  })

  readonly OPERATIONS: TSelectOption<TAgentOutputVariable['operation']>[] = VariableOperations

  addParameter(param: Partial<TXpertParameter>) {
    this.parameters.update((state) => {
      if (!state.some((p) => p.name === param.name)) {
        return [...state, param as TXpertParameter]
      }
      return state
    })
  }

  setParameter(index: number, value: TXpertParameter) {
    this.parameters.update((state) => {
      state[index] = value
      return [...state]
    })
  }

  deleteParameter(i: number) {
    this.parameters.update((state) => {
      state.splice(i, 1)
      return [...state]
    })
  }
}
