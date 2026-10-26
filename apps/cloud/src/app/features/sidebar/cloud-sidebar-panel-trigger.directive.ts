import type { IXpert } from '@xpert-ai/contracts'
import {
  Directive,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  TemplateRef,
  inject,
  input,
  output
} from '@angular/core'
import { CloudSidebarHoverPanelDirective } from './cloud-sidebar-hover-panel.directive'

export interface SidebarPanelContext {
  /** The current panel's search text. Business templates retain their own typed resource context. */
  $implicit: string
  assistant?: IXpert
}

export interface SidebarPanelHeaderContext {
  assistant?: IXpert
  holdOpen: (held: boolean) => void
}

/** Register a business template without moving its data ownership into the shared overlay. */
@Directive({
  standalone: true,
  selector: '[xpSidebarPanelTrigger]',
  host: {
    '[attr.aria-expanded]': 'xpSidebarPanelTrigger() ? panelOpen() : null',
    '[attr.aria-controls]': 'xpSidebarPanelTrigger() ? panelId() : null'
  }
})
export class CloudSidebarPanelTriggerDirective implements OnInit, OnDestroy {
  readonly xpSidebarPanelTrigger = input<TemplateRef<SidebarPanelContext> | null>(null)
  readonly xpSidebarPanelHeader = input<TemplateRef<SidebarPanelHeaderContext> | null>(null)
  readonly xpSidebarPanelKey = input.required<string>()
  readonly xpSidebarPanelAssistant = input<IXpert | undefined>(undefined)
  readonly panelActivated = output<void>()
  /** Explicit selection only; hover activation must never navigate. */
  readonly panelSelected = output<Event>()
  private readonly panel = inject(CloudSidebarHoverPanelDirective, { optional: true })
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement
  panelOpen() {
    return this.panel?.isTriggerOpen(this.element) ?? false
  }
  panelId() {
    return this.panel?.panelId ?? null
  }

  ngOnInit() {
    this.panel?.register(this.element, () => ({
      key: this.xpSidebarPanelKey(),
      template: this.xpSidebarPanelTrigger(),
      header: this.xpSidebarPanelHeader(),
      assistant: this.xpSidebarPanelAssistant(),
      activate: () => this.panelActivated.emit()
    }))
  }

  ngOnDestroy() {
    this.panel?.unregister(this.element)
  }

  @HostListener('click', ['$event'])
  onClick(event: MouseEvent) {
    const interactive = event.target instanceof Element ? event.target.closest('button,a,input') : null
    if (interactive && interactive !== this.element && this.element.contains(interactive)) return
    // Directory entries can be destroyed when their panel content is replaced.
    if (this.xpSidebarPanelTrigger()) this.panelSelected.emit(event)
    if (this.panel?.openRegistered(this.element)) {
      event.preventDefault()
      event.stopPropagation()
    }
  }

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent) {
    if (
      event.target === this.element &&
      this.element.tagName !== 'BUTTON' &&
      (event.key === 'Enter' || event.key === ' ')
    ) {
      if (this.xpSidebarPanelTrigger()) this.panelSelected.emit(event)
      if (this.panel?.openRegistered(this.element)) event.preventDefault()
    }
  }
}
