import { afterNextRender, Directive, ElementRef, inject, input } from '@angular/core'
import { ActivatedRoute } from '@angular/router'

/** Moves focus to a linked section once its asynchronously loaded content is actually rendered. */
@Directive({ selector: '[xpEvolutionLanding]', standalone: true, host: { tabindex: '-1' } })
export class EvolutionLandingDirective {
  readonly anchor = input.required<string>({ alias: 'xpEvolutionLanding' })
  private readonly element = inject(ElementRef<HTMLElement>)
  private readonly route = inject(ActivatedRoute, { optional: true })
  constructor() {
    afterNextRender(() => {
      if (this.route?.snapshot?.fragment !== this.anchor()) return
      this.element.nativeElement.focus({ preventScroll: true })
      this.element.nativeElement.scrollIntoView({ block: 'start', inline: 'nearest' })
    })
  }
}
