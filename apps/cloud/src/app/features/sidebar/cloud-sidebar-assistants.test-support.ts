import { Component, Directive, EventEmitter, Input, Output } from '@angular/core'

@Component({ selector: 'z-icon', template: '' })
class ZardIconComponent {
  @Input() zType?: string
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

export const headlessUi = {
  ZardIconComponent,
  ZardTooltipImports: [ZTooltipDirective],
  ZardMenuImports: [ZMenuDirective]
}
