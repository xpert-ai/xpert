import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { ISkillMarketFeaturedSkill } from '@cloud/app/@core'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { skillDisplayDescription, skillDisplayTitle, skillFeaturedAvatar } from '../skill.utils'

@Component({
  standalone: true,
  selector: 'xp-skill-featured-grid',
  imports: [
    CommonModule,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardCardImports
  ],
  templateUrl: './skill-featured-grid.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillFeaturedGridComponent {
  readonly items = input<ISkillMarketFeaturedSkill[]>([])
  readonly loading = input(false)
  readonly view = output<ISkillMarketFeaturedSkill>()
  readonly install = output<ISkillMarketFeaturedSkill>()

  readonly visibleItems = computed(() => this.items().slice(0, 6))

  title(featured: ISkillMarketFeaturedSkill) {
    return skillDisplayTitle(featured.skill, featured)
  }

  description(featured: ISkillMarketFeaturedSkill) {
    return skillDisplayDescription(featured.skill, featured)
  }

  avatar(featured: ISkillMarketFeaturedSkill) {
    return skillFeaturedAvatar(featured)
  }

  tags(featured: ISkillMarketFeaturedSkill) {
    return (featured.skill.tags ?? []).slice(0, 2)
  }

  open(featured: ISkillMarketFeaturedSkill) {
    this.view.emit(featured)
  }

  add(featured: ISkillMarketFeaturedSkill, event: MouseEvent) {
    event.stopPropagation()
    this.install.emit(featured)
  }
}
