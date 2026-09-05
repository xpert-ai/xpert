import { ComponentPortal } from '@angular/cdk/portal'
import { Directive, effect, inject, input, untracked, ViewContainerRef, type ComponentRef } from '@angular/core'
import type { IXpert } from '@xpert-ai/contracts'
import { ZardHoverCardDirective } from '@xpert-ai/headless-ui'
import { AssistantProfileComponent } from './assistant-profile.component'

@Directive({
  standalone: true,
  selector: '[xpAssistantProfile]',
  exportAs: 'xpAssistantProfile',
  hostDirectives: [{ directive: ZardHoverCardDirective, inputs: ['zPlacement'] }],
  host: { '(keydown.alt.arrowdown)': 'open($event)' }
})
export class AssistantProfileDirective {
  readonly assistantId = input.required<string>({ alias: 'xpAssistantProfile' })
  readonly summary = input<Partial<IXpert> | null>(null)
  private readonly hover = inject(ZardHoverCardDirective)
  private readonly container = inject(ViewContainerRef)
  private profile?: ComponentRef<AssistantProfileComponent>

  constructor() {
    this.hover.setContentFactory((overlay) => {
      if (!this.assistantId()) return
      this.profile = overlay.attach(new ComponentPortal(AssistantProfileComponent, this.container))
      this.profile.setInput('assistantId', this.assistantId())
      this.profile.setInput('summary', this.summary())
      this.profile.instance.closed.subscribe(() => this.hover.close())
      this.profile.instance.holdOpen.subscribe((hold) => this.hover.setHoldOpen(hold))
    })
    effect(() => {
      this.assistantId()
      this.summary()
      // A different instance must destroy every old view/request before the next opening.
      untracked(() => this.hover.close(false))
    })
  }
  open(event?: Event) {
    event?.preventDefault()
    event?.stopPropagation()
    if (this.assistantId()) this.hover.open(true)
  }
}
