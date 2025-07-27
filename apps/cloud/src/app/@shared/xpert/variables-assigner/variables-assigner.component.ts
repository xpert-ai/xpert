import { CommonModule } from '@angular/common'
import { Component, computed, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  TAgentOutputVariable,
  TVariableAssigner,
  TXpertParameter,
  uuid,
  VariableOperations
} from '../../../@core/types'
import { StateVariableSelectComponent, TXpertVariablesOptions } from '../../agent'
import { NgmSelectComponent } from '../../common'

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
  // Inputs
  readonly title = input<string>()
  readonly tooltip = input<string>()
  // readonly variables = input<TWorkflowVarGroup[]>()
  readonly varOptions = input.required<TXpertVariablesOptions>()
  readonly parameters = input<TXpertParameter[]>()
  readonly memories = model<TVariableAssigner[]>()
  readonly type = input<'tool' | 'agent' | 'variable'>()

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
  readonly AgentValueOptions: TSelectOption<TVariableAssigner['value']>[] = [
    {
      value: 'content',
      label: {
        zh_Hans: '内容',
        en_US: 'Content'
      }
    }
  ]

  readonly ValueOptions = computed(() => {
    const options = this.type() === 'tool' ? this.ToolValueOptions : this.AgentValueOptions
    return options.concat(
      this.parameters()?.map((param) => ({
        value: param.name,
        label: param.title || param.description || param.name
      })) ?? []
    )
  })

  readonly hoveredDelIndex = signal<number | null>(null)

  add() {
    this.memories.update((state) => [...(state ?? []), { id: uuid() } as TVariableAssigner])
  }

  updateMemory(index: number, name: string, value: any) {
    this.memories.update((memories) => {
      const entity = { [name]: value }
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
    this.memories.update((memories) => {
      memories.splice(index, 1)
      return [...memories]
    })
  }
}
