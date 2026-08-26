import { ChangeDetectionStrategy, Component } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { ClawXpertToolPreferencesComponent } from '../../../chat/clawxpert/clawxpert-tool-preferences.component'
import { ClawXpertFacade } from '../../../chat/clawxpert/clawxpert.facade'

@Component({
  standalone: true,
  selector: 'xp-clawxpert-workspace-skills-page',
  imports: [RouterLink, TranslateModule, ClawXpertToolPreferencesComponent],
  providers: [ClawXpertFacade],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="relative min-h-full bg-background-body px-6 py-6 lg:px-8 xl:px-12">
      <a
        routerLink="/explore"
        class="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-1 text-sm font-medium text-text-secondary transition-colors hover:bg-hover-bg hover:text-text-primary"
      >
        <i class="ri-arrow-left-s-line text-xl" aria-hidden="true"></i>
        {{ 'XP.Explore.AllSkillsTitle' | translate: { Default: 'All skills' } }}
      </a>

      <xp-clawxpert-tool-preferences class="mt-10 block min-w-0" [skillsOnly]="true" />
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
