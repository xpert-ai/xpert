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
    <main class="clawxpert-skills-page">
      <xp-clawxpert-tool-preferences [skillsOnly]="true" />
    </main>
  `,
  styles: `
    :host {
      display: block;
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      min-height: 0;
    }

    .clawxpert-skills-page {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 24px 48px 32px;
    }

    @media (max-width: 768px) {
      .clawxpert-skills-page {
        padding: 16px;
      }
    }
  `
})
export class ClawXpertWorkspaceSkillsPageComponent {}
