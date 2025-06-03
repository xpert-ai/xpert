import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { Component, inject } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TSelectOption } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TAgentOutputVariable, TXpertParameter, VariableOperations, XpertParameterTypeEnum } from '../../../@core'
import { XpertParameterInputComponent } from '../parameter-input/input.component'
import { XpertParameterMenuItemComponent } from '../parameter-menu/menu-item.component'

@Component({
  standalone: true,
  selector: 'xpert-output-variables-edit',
  templateUrl: './output-variables.component.html',
  styleUrl: 'output-variables.component.scss',
  imports: [
    CommonModule,
    TranslateModule,
    FormsModule,
    CdkMenuModule,
    DragDropModule,
    MatTooltipModule,

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
  readonly parameters = this.value$

  // readonly form = this.#fb.group({
  //   parameters: this.#fb.array([])
  // })

  // get parameters() {
  //   return this.form.get('parameters') as FormArray
  // }

  readonly OPERATIONS: TSelectOption<TAgentOutputVariable['operation']>[] = VariableOperations

  // constructor() {
  //   effect(
  //     () => {
  //       const value = this.cva.value$()
  //       if (value && !this.value$()?.length) {
  //         this.initParameters(value)
  //       }
  //     },
  //     { allowSignalWrites: true }
  //   )
  // }

  // onChange() {
  //   this.cva.writeValue(this.parameters.value)
  // }

  initParameters(values: TAgentOutputVariable[]) {
    // this.parameters.clear()
    // values?.forEach((p) => {
    //   this.addParameter(p, { emitEvent: false })
    // })
  }

  addParameter(param: Partial<TXpertParameter>, options?: { emitEvent: boolean }) {
    this.parameters.update((state) => {
      return [...state, param as TXpertParameter]
    })
    //   this.parameters.push(
    //     this.#fb.group({
    //       type: this.#fb.control(param.type),
    //       name: this.#fb.control(param.name),
    //       title: this.#fb.control(param.title),
    //       description: this.#fb.control(param.description),
    //       optional: this.#fb.control(param.optional),
    //       maximum: this.#fb.control(param.maximum),
    //       options: this.#fb.control(param.options),
    //       operation: this.#fb.control(param.operation),
    //       item: this.#fb.control(param.item),
    //       variableSelector: this.#fb.control(param.variableSelector)
    //     })
    //   )

    //   if (isNil(options?.emitEvent) || options.emitEvent) {
    //     this.onChange()
    //   }
  }

  setParameter(index: number, value: TXpertParameter) {
    this.parameters.update((state) => {
      state[index] = value
      return [...state]
    })
  }

  // updateParameter(index: number, name: string, value: string) {
  //   this.parameters.at(index).get(name).setValue(value, { emitEvent: true })
  //   this.form.markAsDirty()
  //   this.onChange()
  // }

  deleteParameter(i: number) {
    this.parameters.update((state) => {
      state.splice(i, 1)
      return [...state]
    })
  }

  // drop(index: number, event: CdkDragDrop<string, string>) {
  //   const control = this.parameters.at(index)
  //   moveItemInArray(control.value.options, event.previousIndex, event.currentIndex)
  //   control.patchValue({
  //     options: control.value.options
  //   })
  //   this.onChange()
  // }
}
