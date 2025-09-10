import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, model } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TSelectOption, TVariableAssigner, TWorkflowVarGroup, TXpertParameter } from '@metad/contracts'
import { attrModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { NgmSelectComponent } from '../../common'
import { CopilotPromptEditorComponent } from '../../copilot/prompt-editor/editor.component'
import { StateVariableSelectComponent } from '../state-variable-select/select.component'
import { CdkMenuModule } from '@angular/cdk/menu'
import { TXpertVariablesOptions } from '@cloud/app/@core'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    NgmSelectComponent,
    StateVariableSelectComponent,
    CopilotPromptEditorComponent
  ],
  selector: 'xpert-memory-assigner',
  templateUrl: './memory-assigner.component.html',
  styleUrls: ['./memory-assigner.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertMemoryAssignerComponent {
  protected cva = inject<NgxControlValueAccessor<TVariableAssigner>>(NgxControlValueAccessor)

  readonly value$ = this.cva.value$

  // Inputs
  readonly varOptions = input<TXpertVariablesOptions>()
  readonly variables = model<TWorkflowVarGroup[]>()
  readonly type = input<'tool' | 'agent' | 'variable'>()
  readonly parameters = input<TXpertParameter[]>()

  // Models
  readonly variableSelector = attrModel(this.value$, 'variableSelector')
  readonly inputType = attrModel(this.value$, 'inputType')
  readonly value = attrModel(this.value$, 'value')
  readonly messages = attrModel(this.value$, 'messages')

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
    },
    // {
    //   value: 'message',
    //   label: {
    //     zh_Hans: '消息',
    //     en_US: 'Message'
    //   }
    // }
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

  addMessage(role: 'human' | 'ai') {
    this.messages.update((messages) => {
      messages ??= []
      messages.push({ role, content: '' })
      return [...messages]
    })
  }

  updateMessageContent(index: number, content: string) {
    this.messages.update((messages) => {
      messages[index] = {
        ...messages[index],
        content
      }
      return [...messages]
    })
  }

  removeMessage(index: number) {
    this.messages.update((messages) => {
      messages.splice(index, 1)
      return [...messages]
    })
  }
}
