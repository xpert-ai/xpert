import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import type { ISkillRepositoryIndex } from '@cloud/app/@core'
import { ZardBadgeComponent, ZardButtonComponent, ZardCardImports, ZardIconComponent } from '@xpert-ai/headless-ui'
import { skillDisplayDescription, skillDisplayTitle } from '../skill.utils'

@Component({
  standalone: true,
  selector: 'xp-skill-all-list',
  imports: [
    CommonModule,
    TranslateModule,
    WaIntersectionObserver,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardIconComponent,
    ...ZardCardImports
  ],
  templateUrl: './skill-all-list.component.html',
  host: {
    class: 'block'
  },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SkillAllListComponent {
  readonly items = input<ISkillRepositoryIndex[]>([])
  readonly loading = input(false)
  readonly loadingMore = input(false)
  readonly hasMore = input(false)
  readonly view = output<ISkillRepositoryIndex>()
  readonly install = output<ISkillRepositoryIndex>()
  readonly loadMore = output<void>()

  title(item: ISkillRepositoryIndex) {
    return skillDisplayTitle(item)
  }

  description(item: ISkillRepositoryIndex) {
    return skillDisplayDescription(item)
  }

  tags(item: ISkillRepositoryIndex) {
    return (item.tags ?? []).slice(0, 2)
  }

  iconType(item: ISkillRepositoryIndex) {
    const tags = (item.tags ?? []).join(' ').toLowerCase()
    if (tags.includes('api') || tags.includes('code') || tags.includes('开发')) {
      return 'code'
    }
    if (tags.includes('document') || tags.includes('文档') || tags.includes('ocr')) {
      return 'file-text'
    }
    if (tags.includes('data') || tags.includes('数据') || tags.includes('分析')) {
      return 'database'
    }
    return 'sparkles'
  }

  open(item: ISkillRepositoryIndex) {
    this.view.emit(item)
  }

  add(item: ISkillRepositoryIndex, event: MouseEvent) {
    event.stopPropagation()
    this.install.emit(item)
  }
}
