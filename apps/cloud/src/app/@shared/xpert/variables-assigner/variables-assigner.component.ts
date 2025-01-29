import { CommonModule } from '@angular/common'
import { Component, computed, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { TAgentOutputVariable, TStateVariable, TVariableAssigner, uuid, VariableOperations } from '../../../@core/types'
import { NgmSelectComponent } from '../../common'
import { StateVariableSelectComponent } from '../state-variable-select/select.component'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmSelectComponent,
    StateVariableSelectComponent
  ],
  selector: 'xpert-variables-assigner',
  templateUrl: 'variables-assigner.component.html',
  styleUrls: ['variables-assigner.component.scss']
})
export class XpertVariablesAssignerComponent {

  readonly title = input<string>()
  readonly tooltip = input<string>()
  readonly variables = input<TStateVariable[]>()
  readonly memories = model<TVariableAssigner[]>()

  readonly selectOptions = computed(() =>
    this.variables()?.map((va) => ({
      value: va.name,
      label: va.description || va.name
    }))
  )

  readonly OPERATIONS: TSelectOption<TAgentOutputVariable['operation']>[] = VariableOperations
  readonly InputTypeOptions: TSelectOption<TVariableAssigner['inputType']>[] = [
    {
      value: 'constant',
      label: {
        zh_Hans: '常量',
        en_US: 'Constant'
      }
    },
    {
      value: 'variable',
      label: {
        zh_Hans: '变量',
        en_US: 'Variable'
      }
    }
  ]
  readonly ToolValueOptions: TSelectOption<TVariableAssigner['value']>[] = [
    {
      value: 'content',
      label: {
        zh_Hans: '内容',
        en_US: 'Content'
      }
    },
    {
      value: 'artifact',
      label: {
        zh_Hans: '结构数据',
        en_US: 'Artifact'
      }
    }
  ]

  add() {
    this.memories.update((state) => [...(state ?? []), { id: uuid() } as TVariableAssigner])
  }

  updateMemory(index: number, name: string, value: any) {
    this.memories.update((memories) => {
      const entity = {[name]: value}
      if (name === 'inputType' && memories[index].inputType !== value) {
        entity.value = null
      }
      memories[index] = {
        ...(memories[index] ?? {}),
        ...entity
      } as TVariableAssigner
      return [...memories]
    })
  }

  deleteMemory(index: number) {
    this.memories.update((memories) => memories?.splice(index, 1))
  }
}
