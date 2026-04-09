import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { ISkillMarketFeaturedSkill, ISkillRepositoryIndex } from '@cloud/app/@core'
import { IconComponent } from '../../../../@shared/avatar/icon/icon.component'
import {
  skillDisplayDescription,
  skillDisplayTitle,
  skillFeaturedAvatar,
  skillPublisherAvatarFallback,
  skillPublisherAvatarImage,
  skillPublisherDisplayName,
  skillPublisherHandle
} from '../skill.utils'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  selector: 'xp-explore-skill-card',
  imports: [CommonModule, TranslateModule, IconComponent, ZardButtonComponent, ZardIconComponent],
  templateUrl: './skill-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreSkillCardComponent {
  readonly item = input.required<ISkillRepositoryIndex>()
  readonly featured = input<ISkillMarketFeaturedSkill | null>(null)
  readonly variant = input<'featured' | 'grid'>('grid')

  readonly view = output<void>()
  readonly install = output<void>()

  readonly #compactNumber = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1
  })

  readonly alwaysShowActions = signal(
    typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(hover: none), (pointer: coarse)').matches
  )

  readonly title = computed(() => skillDisplayTitle(this.item(), this.featured()))
  readonly description = computed(() => skillDisplayDescription(this.item(), this.featured()))
  readonly badge = computed(() => this.featured()?.badge?.trim() || null)
  readonly featuredAvatar = computed(() => skillFeaturedAvatar(this.featured()))
  readonly publisherAvatarImage = computed(() => (!this.featuredAvatar() ? skillPublisherAvatarImage(this.item()) : null))
  readonly publisherAvatarFallback = computed(() => skillPublisherAvatarFallback(this.item()))
  readonly publisherName = computed(() => skillPublisherDisplayName(this.item()))
  readonly publisherHandle = computed(() => skillPublisherHandle(this.item()))
  readonly repositoryName = computed(() => this.item().repository?.name || null)
  readonly visibleTags = computed(() => (this.item().tags ?? []).slice(0, this.variant() === 'featured' ? 4 : 3))
  readonly hiddenTagCount = computed(() => Math.max((this.item().tags?.length ?? 0) - this.visibleTags().length, 0))
  readonly avatarIconSize = computed(() => {
    const avatar = this.featuredAvatar()
    if (!avatar) {
      return 24
    }

    return avatar.type === 'image' ? 44 : avatar.size ?? 22
  })
  readonly actionsClass = computed(() =>
    this.alwaysShowActions()
      ? 'pointer-events-auto opacity-100 translate-y-0'
      : 'pointer-events-none opacity-0 translate-y-2 md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-hover:translate-y-0 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:translate-y-0'
  )

  openDetails() {
    this.view.emit()
  }

  onCardKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    this.openDetails()
  }

  addToWorkspace(event: MouseEvent) {
    event.stopPropagation()
    this.install.emit()
  }

  formatStat(value?: number | null): string {
    return typeof value === 'number' && Number.isFinite(value) ? this.#compactNumber.format(value) : '--'
  }
}
