import { CommonModule } from '@angular/common'
import { Component, computed, input, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TSelectOption } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  TAgentOutputVariable,
  TVariableAssigner,
  TWorkflowVarGroup,
  TXpertParameter,
  uuid,
  VariableOperations
} from '../../../@core/types'
import { TXpertVariablesOptions, XpertMemoryAssignerComponent } from '../../agent'

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
    XpertMemoryAssignerComponent
  ],
  selector: 'xpert-variables-assigner',
  templateUrl: 'variables-assigner.component.html',
  styleUrls: ['variables-assigner.component.scss']
})
export class XpertVariablesAssignerComponent {
  // Inputs
  readonly title = input<string>()
  readonly tooltip = input<string>()
  readonly varOptions = input<TXpertVariablesOptions>()
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly parameters = input<TXpertParameter[]>()
  readonly memories = model<TVariableAssigner[]>()
  readonly type = input<'tool' | 'agent' | 'variable'>()

  readonly OPERATIONS: TSelectOption<TAgentOutputVariable['operation']>[] = VariableOperations

  readonly hoveredDelIndex = signal<number | null>(null)

  add() {
    this.memories.update((state) => [...(state ?? []), { id: uuid() } as TVariableAssigner])
  }

  updateMemory(index: number, memory: TVariableAssigner) {
    this.memories.update((memories) => {
      memories[index] = {
        ...memories[index],
        ...memory
      }
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
