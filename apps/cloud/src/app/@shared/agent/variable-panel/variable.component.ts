import { Overlay } from '@angular/cdk/overlay'
import { CommonModule } from '@angular/common'
import { afterNextRender, Component, computed, effect, ElementRef, HostListener, inject, input, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { debouncedSignal, myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { of } from 'rxjs'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TXpertVariablesOptions, XpertService } from '@cloud/app/@core'
export { TXpertVariablesOptions } from '@cloud/app/@core/services'
import { getVariableSchema, TStateVariable, TStateVariableType, TWorkflowVarGroup } from '../../../@core/types'


@Component({
  standalone: true,
  imports: [CommonModule, FormsModule, TranslateModule, NgmI18nPipe, NgmSpinComponent],
  selector: 'xpert-variable-panel',
  templateUrl: './variable.component.html',
  styleUrls: ['./variable.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    'tabIndex': '0'
  }
})
export class XpertVariablePanelComponent {
  protected cva = inject<NgxControlValueAccessor<string | null>>(NgxControlValueAccessor)
  readonly overlay = inject(Overlay)
  readonly elementRef = inject(ElementRef)
  readonly xpertAPI = inject(XpertService)
  
  // Inputs
  readonly options = input.required<TXpertVariablesOptions>()
  readonly type = input<TStateVariableType>()

  /**
   * Use as variables cache, if not provided, will fetch variables from API by options
   */
  readonly variables = model<TWorkflowVarGroup[]>(null)

  // Outputs
  readonly close = output<void>()

  // States
  readonly value$ = this.cva.value$
  readonly selected = computed(() => getVariableSchema(this.variables(), this.value$()))
  readonly variable = computed(() => this.selected().variable)
  readonly selectedGroupName = computed(() => this.selected()?.group?.group.name)

  readonly #variables = myRxResource({
    request: () => this.variables() ? null : this.options(),
    loader: ({request}) => {
      return request ? this.xpertAPI.getNodeVariables(request) : of(null)
    }
  })
  readonly loading = computed(() => this.#variables.status() === 'loading')


  readonly searchTerm = signal('')
  readonly #searchTerm = debouncedSignal(this.searchTerm, 300)
  readonly filteredVariables = computed(() => {
    const searchTerm = this.#searchTerm().toLowerCase()
    const type = this.type()
    return this.variables()?.map((group) => ({
        ...group,
        variables: group.variables?.filter((variable) => {
          return type ? variable.type === type : true && 
            (variable.name.toLowerCase().includes(searchTerm) || variable.title?.toLowerCase().includes(searchTerm))
        })
      }))
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

    effect(() => {
      if (this.#variables.value()) {
        this.variables.set(this.#variables.value())
      }
    }, { allowSignalWrites: true })
  }

  focus() {
    (this.elementRef.nativeElement as HTMLElement).focus()
  }

  @HostListener('document:click', ['$event'])
  @HostListener('document:touchend', ['$event'])
  closeOnClickOutside(event: MouseEvent) {
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
  handleEscapeKey(event: KeyboardEvent) {
    const element = this.elementRef.nativeElement as HTMLElement
    if (document.activeElement && element.contains(document.activeElement)) {
      this.close.emit()
    }
  }
}
