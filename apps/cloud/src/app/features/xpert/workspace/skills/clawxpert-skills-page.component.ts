import { ChangeDetectionStrategy, Component } from '@angular/core'
import { ClawXpertToolPreferencesComponent } from '../../../chat/clawxpert/clawxpert-tool-preferences.component'
import { ClawXpertFacade } from '../../../chat/clawxpert/clawxpert.facade'

@Component({
  standalone: true,
  selector: 'xp-clawxpert-workspace-skills-page',
  imports: [ClawXpertToolPreferencesComponent],
  providers: [ClawXpertFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="relative min-h-full bg-background-body px-8 py-8 xl:px-12">
      <xp-clawxpert-tool-preferences class="block min-w-0" [skillsOnly]="true" />
    </main>
  `,
  styles: `
    :host {
      display: block;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 100%;
    }
  `
})
export class ClawXpertWorkspaceSkillsPageComponent {}
