import { Overlay } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  HostListener,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TXpertVariablesOptions, XpertAPIService } from '@cloud/app/@core'
import { NgmHighlightDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { debouncedSignal, linkedModel, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { of } from 'rxjs'
import { getVariableSchema, TStateVariable, TWorkflowVarGroup, XpertParameterTypeEnum } from '../../../@core/types'
import { expandVariablesWithItems, TStateVariableType } from '../types'

export { TXpertVariablesOptions } from '@cloud/app/@core/services'

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, NgmHighlightDirective, NgmSpinComponent],
  selector: 'xpert-variable-panel',
  templateUrl: './variable.component.html',
  styleUrls: ['./variable.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    tabIndex: '0'
  }
})
export class XpertVariablePanelComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)
  readonly overlay = inject(Overlay)
  readonly elementRef = inject(ElementRef)
  readonly xpertAPI = inject(XpertAPIService)
  readonly i18nPipe = new NgmI18nPipe()

  // Inputs
  readonly options = input.required<TXpertVariablesOptions>()
  /**
   * @deprecated use `types` instead
   */
  readonly type = input<string>() // TStateVariableType | string
  readonly types = input<string[]>() // TStateVariableType[]

  /**
   * Use as variables cache, if not provided, will fetch variables from API by options
   */
  readonly variables = model<TWorkflowVarGroup[]>(null)

  // Outputs
  readonly close = output<void>()

  // States
  readonly value$ = this.cva.value$
  readonly selected = computed(() => getVariableSchema(this.flatVariables(), this.value$()))
  readonly variable = computed(() => this.selected().variable)
  readonly selectedGroupName = computed(() => this.selected()?.group?.group?.name)

  readonly #variables = myRxResource({
    request: () => (this.variables() ? null : this.options()),
    loader: ({ request }) => {
      return request ? this.xpertAPI.getNodeVariables(request) : of(null)
    }
  })
  readonly loading = computed(() => this.#variables.status() === 'loading')

  readonly flatVariables = linkedModel({
    initialValue: null,
    compute: () => {
      return this.variables() ? expandVariablesWithItems(this.variables()) : null
    },
    update: (value) => {
      // No-op
    }
  })

  readonly searchTerm = signal('')
  readonly #searchTerm = debouncedSignal(this.searchTerm, 300)
  readonly filteredVariables = computed(() => {
    const searchTerm = this.#searchTerm().toLowerCase()
    const types = this.types() ?? (this.type() ? [this.type()] : null)
    return this.flatVariables()
      ?.map((group) => {
        let variables = group.variables
        if (searchTerm || types) {
          variables = variables?.filter((variable) => {
              const description = variable.description
              return (types.length
                ? types.some(type => variable.type?.startsWith(type))
                : true) &&
                    (
                      variable.name.toLowerCase().includes(searchTerm) ||
                      (this.i18nPipe.transform(description)?.toLowerCase().includes(searchTerm)) ||
                      this.i18nPipe.transform(group.group.description)?.toLowerCase().includes(searchTerm)
                    )
            })
        }

        return {
          ...group,
          variables: variables as TStateVariableType[]
        }
      })
      .filter((group) => group.variables?.length > 0)
  })

  selectVariable(group: string, variable: TStateVariable) {
    this.cva.writeValue(group ? `${group}.${variable.name}` : variable.name)
  }

  private isListening = signal(false)

  constructor() {
    afterNextRender(() => {
      setTimeout(() => {
        this.isListening.set(true)
      }, 1000)
    })

    effect(
      () => {
        if (this.#variables.value()) {
          this.variables.set(this.#variables.value())
        }
      },
      { allowSignalWrites: true }
    )
  }

  isSelectedGroup(name: string) {
    return this.selectedGroupName() ? this.selectedGroupName() === name : !name
  }

  isVariableExpandable(item: TStateVariableType) {
    return item.type === XpertParameterTypeEnum.FILE || this.hasItemChildren(item)
  }

  isVariableExpanded(item: TStateVariableType, group: TWorkflowVarGroup) {
    return !!item.expanded || this.hasSelectedDescendant(item.name, group)
  }

  shouldShowVariable(item: TStateVariableType, group: TWorkflowVarGroup) {
    if (!item.parent) {
      return true
    }
    const variables = this.getGroupVariables(group)
    return this.isParentVisible(item.parent, variables, group)
  }

  private hasItemChildren(variable: TStateVariableType) {
    return Array.isArray(variable.item) && variable.item.length > 0
  }

  private hasSelectedDescendant(name: string, group: TWorkflowVarGroup) {
    const selectedName = this.variable()?.name
    return this.isSelectedGroup(group.group?.name) && !!selectedName && selectedName.startsWith(`${name}.`)
  }

  private getGroupVariables(group: TWorkflowVarGroup) {
    const allGroups = this.flatVariables()
    if (!allGroups?.length) {
      return (group.variables ?? []) as TStateVariableType[]
    }
    const groupName = group.group?.name
    const match = allGroups.find((item) => (groupName ? item.group?.name === groupName : !item.group?.name))
    return (match?.variables ?? group.variables) as TStateVariableType[]
  }

  private isParentVisible(parentName: string, variables: TStateVariableType[], group: TWorkflowVarGroup) {
    let currentName: string | undefined = parentName
    let guard = 0
    while (currentName && guard < 50) {
      const parent = variables.find((item) => item.name === currentName)
      if (!parent) {
        return false
      }
      if (!parent.expanded && !this.hasSelectedDescendant(currentName, group)) {
        return false
      }
      currentName = parent.parent
      guard += 1
    }
    return true
  }

  toggleVariable(variable: TStateVariableType) {
    this.flatVariables.update((groups) => {
      return groups?.map((group) => {
        const groupVariables = group.variables as TStateVariableType[]
        const index = groupVariables.findIndex((item) => item.name === variable.name)
        if (index === -1) {
          return group
        }
        const variables = groupVariables.map((item: TStateVariableType) => {
          if (item.name === variable.name) {
            return {
              ...item,
              expanded: !item.expanded
            } as TStateVariableType
          }
          return item as TStateVariableType
        })
        return {
          ...group,
          variables
        }
      })
    })
  }

  getPaddingLevels(item: TStateVariableType) {
    const levels = []
    let currentLevel = item.level ?? 0
    while (currentLevel > 0) {
      levels.push(currentLevel)
      currentLevel -= 1
    }
    return levels.reverse()
  }

  focus() {
    ;(this.elementRef.nativeElement as HTMLElement).focus()
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:touchend', ['$event'])
  closeOnClickOutside(event: MouseEvent | TouchEvent) {
    if (!this.isListening()) {
      return
    }
    const target = event.target as HTMLElement
    const element = this.elementRef.nativeElement as HTMLElement

    // Check if the click is outside the component
    if (!element.contains(target)) {
      this.close.emit()
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  handleEscapeKey(event: Event) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }
}
