import { Component, inject, input } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardButtonComponent, ZardMenuImports } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'

@Component({
  selector: 'xp-evolution-page-header',
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent, ...ZardMenuImports],
  templateUrl: './evolution-page-header.component.html',
  host: { class: 'block shrink-0 bg-background text-foreground' }
})
export class EvolutionPageHeaderComponent {
  readonly titleKey = input.required<string>()
  readonly facade = inject(AgentEvolutionFacade)
}
