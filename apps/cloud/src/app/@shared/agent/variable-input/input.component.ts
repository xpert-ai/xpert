import { CdkMenuModule } from '@angular/cdk/menu'
import { Overlay, OverlayRef } from '@angular/cdk/overlay'
import { TemplatePortal } from '@angular/cdk/portal'
import { CommonModule } from '@angular/common'
import {
  Component,
  inject,
  input,
  signal,
  TemplateRef,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { linkedModel } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { TWorkflowVarGroup } from '../../../@core/types'
import { StateVariableSelectComponent } from '../state-variable-select/select.component'
import { XpertVariablePanelComponent } from '../variable-panel/variable.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    MatTooltipModule,
    StateVariableSelectComponent,
    XpertVariablePanelComponent
  ],
  selector: 'xpert-variable-input',
  templateUrl: './input.component.html',
  styleUrls: ['./input.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class XpertVariableInputComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)
  readonly overlay = inject(Overlay)
  readonly #vcr = inject(ViewContainerRef)

  // Inputs
  readonly variables = input<TWorkflowVarGroup[]>()
  readonly placeholder = input<string>()
  readonly type = input<string>()
  readonly autocomplete = input<string>()

  // Children
  readonly suggestionsTemplate = viewChild('suggestionsTemplate', { read: TemplateRef<any> })
  readonly varPanel = viewChild('varPanel', { read: XpertVariablePanelComponent })

  // States
  readonly currentIndex = signal(0)
  readonly cursorIndex = signal(0)
  readonly currentElement = signal<HTMLElement>(null)
  overlayRef: OverlayRef | null = null

  readonly items = linkedModel<{ type: 'text' | 'variable'; value: string }[]>({
    initialValue: null,
    compute: () => {
      const content = this.cva.value$()
      return content ? parseTemplateString(content) : [{ type: 'text', value: '' }]
    },
    update: (value) => {
      this.cva.writeValue(value.map(({ type, value }) => (type === 'text' ? value : `{{${value}}}`)).join(''))
    }
  })

  constructor() {
    // effect(() => {
    //   console.log(this.cva.value$(), this.currentIndex(), this.cursorIndex())
    // })
  }

  update(index: number, value: string) {
    this.items.update((state) => {
      state[index] = {
        ...state[index],
        value
      }
      return [...state]
    })
  }

  onFocus(event: Event, index: number) {
    this.currentIndex.set(index)
  }

  updateCursor(event: Event, input: HTMLInputElement) {
    this.cursorIndex.set(input.selectionStart ?? 0)
    this.currentElement.set(input)
  }

  onKeydown(event: KeyboardEvent, input: HTMLInputElement) {
    if (event.key === 'Backspace' && input.value === '') {
      const currentIndex = this.currentIndex()
      if (currentIndex > 0 && this.items()[currentIndex - 1].type === 'variable') {
        this.items.update((state) => {
          state.splice(currentIndex - 1, 1)
          return [...state]
        })
        this.currentIndex.set(currentIndex - 1)
      }
    }
  }

  onKeyup(event: KeyboardEvent, input: HTMLInputElement) {
    this.cursorIndex.set(input.selectionStart ?? 0)

    if (event.key === 'Escape') {
      return this.hideSuggestions()
    }

    if (event.key === '/' && !event.shiftKey && !event.ctrlKey) {
      return this.showSuggestions()
    }
  }

  showSuggestions() {
    if (!this.variables()?.length) {
      return
    }
    const caretCoords = this.getCursorPosition()
    const positionStrategy = this.overlay
      .position()
      .flexibleConnectedTo(caretCoords)
      .withPositions([{ originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }])

    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({ positionStrategy })
      const portal = new TemplatePortal(this.suggestionsTemplate(), this.#vcr)
      this.overlayRef.attach(portal)
    } else {
      this.overlayRef.updatePositionStrategy(positionStrategy)
    }
    this.varPanel().focus()
  }

  hideSuggestions() {
    if (this.overlayRef) {
      this.overlayRef.detach()
      this.overlayRef = null
    }
    this.currentElement()?.focus()
  }

  getCursorPosition() {
    // Check if viewLines exists
    const rect = this.currentElement().getBoundingClientRect()

    // Calculate the absolute coordinates of the cursor on the page
    const cursorX = rect.left
    const cursorY = rect.top

    return { x: cursorX, y: cursorY }
  }

  setVariable(variable: string) {
    const item = this.items()[this.currentIndex()]
    if (item?.type === 'text') {
      const prefix = item.value.slice(0, this.cursorIndex() - 1)
      const after = item.value.slice(this.cursorIndex())
      this.items.update((state) => {
        state.splice(
          this.currentIndex(),
          1,
          {
            type: 'text',
            value: prefix
          },
          {
            type: 'variable',
            value: variable
          },
          {
            type: 'text',
            value: after
          }
        )
        return [...state]
      })
    }
  }
}

function parseTemplateString(str) {
  const regex = /{{(.*?)}}/g
  let result = []
  let lastIndex = 0
  let match: RegExpExecArray
  let lastWasVariable = false

  while ((match = regex.exec(str)) !== null) {
    // 添加变量前的纯文本
    if (match.index > lastIndex) {
      result.push({
        type: 'text',
        value: str.slice(lastIndex, match.index)
      })
      lastWasVariable = false
    }

    // 添加变量
    if (lastWasVariable) {
      // 如果上一个也是变量，插入一个空的文本
      result.push({
        type: 'text',
        value: ''
      })
    }
    result.push({
      type: 'variable',
      value: match[1].trim()
    })
    lastWasVariable = true

    // 更新 lastIndex
    lastIndex = regex.lastIndex
  }

  // 结尾还有纯文本
  if (lastIndex < str.length) {
    result.push({
      type: 'text',
      value: str.slice(lastIndex)
    })
  } else {
    result.push({
      type: 'text',
      value: ''
    })
  }

  return result
}
