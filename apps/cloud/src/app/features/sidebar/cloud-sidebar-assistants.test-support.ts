import { Component, Directive, EventEmitter, Input, Output } from '@angular/core'

@Component({ selector: 'z-icon', template: '' })
class ZardIconComponent {
  @Input() zType?: string
}

@Directive({ selector: '[z-button]' })
class ZardButtonComponent {
  @Input() zType?: string
  @Input() zSize?: string
  @Input() zDisabled?: boolean
  @Input() zLoading?: boolean
}

@Directive({ selector: '[zTooltip]' })
class ZTooltipDirective {
  @Input() zTooltip?: string
  @Input() zPosition?: string
  @Input() zDisabled?: boolean
}

@Directive({ selector: '[z-menu]', exportAs: 'zMenuTrigger' })
class ZMenuDirective {
  @Input() zMenuTriggerFor?: unknown
  close() {}
}

@Component({ selector: 'xp-workbench-assistant-menu', template: '' })
export class AssistantMenuStub {
  @Output() selected = new EventEmitter<void>()
}

@Component({ selector: 'z-search-input', template: '<input [value]="value" (input)="onInput($event)" />' })
class SearchInputStub {
  onInput(event: Event) {
    if (event.target instanceof HTMLInputElement) this.valueChange.emit(event.target.value)
  }
  @Input() value = ''
  @Input() placeholder = ''
  @Input() clearLabel = ''
  @Input('aria-label') ariaLabel = ''
  @Output() valueChange = new EventEmitter<string>()
}

export const headlessUi = {
  ZardSearchInputComponent: SearchInputStub,
  XpDialogFrameImports: [],
  ZardButtonComponent,
  ZardIconComponent,
  ZardTooltipImports: [ZTooltipDirective],
  ZardMenuImports: [ZMenuDirective]
}
