import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { IXpert, TXpertTemplate, XpertTypeEnum } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { ZardButtonComponent, ZardTooltipDirective } from '@xpert-ai/headless-ui'

export type ExploreXpertCardVariant = 'square' | 'mine'

@Component({
  standalone: true,
  selector: 'xp-explore-xpert-card',
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, NgmHighlightDirective, ZardButtonComponent, ZardTooltipDirective],
  templateUrl: './xpert-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreXpertCardComponent {
  readonly variant = input<ExploreXpertCardVariant>('square')
  readonly search = input('')
  readonly mineItem = input<IXpert | null>(null)
  readonly templateItem = input<TXpertTemplate | null>(null)

  readonly cardClick = output<void>()
  readonly actionClick = output<void>()

  readonly isMine = computed(() => this.variant() === 'mine')
  readonly title = computed(() => this.mineItem()?.title || this.mineItem()?.name || this.templateItem()?.title || this.templateItem()?.name || '')
  readonly description = computed(() => this.mineItem()?.description || this.templateItem()?.description || '')
  readonly category = computed(() => this.templateItem()?.category || '')
  readonly type = computed<TXpertTemplate['type'] | IXpert['type'] | null>(() => this.mineItem()?.type || this.templateItem()?.type || null)
  readonly avatar = computed(() => this.mineItem()?.avatar || this.templateItem()?.avatar)
  readonly displayDate = computed(() => this.mineItem()?.updatedAt || this.mineItem()?.createdAt || null)
  readonly creator = computed(() => {
    const item = this.mineItem()
    return item?.createdBy?.fullName || item?.createdBy?.name || item?.createdBy?.email || '-'
  })

  readonly articleClass = computed(() => {
    const interactiveClass = this.isMine() ? 'cursor-pointer' : ''
    return `group flex h-full flex-col overflow-hidden rounded-[24px] border border-divider-regular bg-components-card-bg shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${interactiveClass}`.trim()
  })

  readonly headerClass = computed(() => 'flex items-start gap-3 border-b border-divider-regular p-5 pb-2')

  readonly avatarClass = computed(() => 'overflow-hidden rounded-2xl shadow-sm')

  readonly badgeClass = computed(() =>
    'absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-divider-regular bg-components-card-bg text-text-secondary shadow-sm'
  )

  handleCardClick() {
    if (this.isMine()) {
      this.cardClick.emit()
    }
  }

  handleCardKeydown(event: KeyboardEvent) {
    if (!this.isMine() || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    this.cardClick.emit()
  }

  handleActionClick(event: Event) {
    event.stopPropagation()
    this.actionClick.emit()
  }

  typeLabel(type = this.type()) {
    switch (type) {
      case XpertTypeEnum.Copilot:
        return 'Copilot'
      case XpertTypeEnum.Agent:
        return 'Agent'
      case 'project':
        return 'Project'
      default:
        return 'Template'
    }
  }

  typeIcon(type = this.type()) {
    switch (type) {
      case XpertTypeEnum.Copilot:
        return 'ri-sparkling-line'
      case 'project':
        return 'ri-team-line'
      default:
        return 'ri-robot-3-line'
    }
  }
}
