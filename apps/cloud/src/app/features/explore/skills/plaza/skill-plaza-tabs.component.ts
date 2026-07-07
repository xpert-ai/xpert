import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ZardTabsImports } from '@xpert-ai/headless-ui'
import { SkillPlazaTab } from './skill-plaza.models'

@Component({
  standalone: true,
  selector: 'xp-skill-plaza-tabs',
  imports: [CommonModule, TranslateModule, ...ZardTabsImports],
  templateUrl: './skill-plaza-tabs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillPlazaTabsComponent {
  readonly active = input<SkillPlazaTab>('featured')
  readonly featuredCount = input(0)
  readonly enterpriseCount = input(0)
  readonly favoritesCount = input(0)
  readonly activeChange = output<SkillPlazaTab>()

  setActive(tab: SkillPlazaTab) {
    this.activeChange.emit(tab)
  }
}
