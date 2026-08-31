import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { IXpert, PluginApplicationStatusSummary, TXpertTemplate, XpertTypeEnum } from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpHighlightDirective } from '@xpert-ai/headless-ui'
import { ZardButtonComponent, ZardTooltipDirective } from '@xpert-ai/headless-ui'

export type ExploreXpertCardVariant = 'square' | 'mine'

@Component({
  standalone: true,
  selector: 'xp-explore-xpert-card',
  imports: [
    CommonModule,
    TranslateModule,
    EmojiAvatarComponent,
    XpHighlightDirective,
    ZardButtonComponent,
    ZardTooltipDirective
  ],
  templateUrl: './xpert-card.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreXpertCardComponent {
  readonly #translate = inject(TranslateService)

  readonly variant = input<ExploreXpertCardVariant>('square')
  readonly search = input('')
  readonly mineItem = input<IXpert | null>(null)
  readonly templateItem = input<TXpertTemplate | null>(null)
  readonly applicationStatus = input<PluginApplicationStatusSummary | null>(null)

  readonly cardClick = output<void>()
  readonly actionClick = output<void>()

  readonly isMine = computed(() => this.variant() === 'mine')
  readonly title = computed(
    () =>
      this.mineItem()?.title || this.mineItem()?.name || this.templateItem()?.title || this.templateItem()?.name || ''
  )
  readonly description = computed(() => this.mineItem()?.description || this.templateItem()?.description || '')
  readonly category = computed(() => this.templateItem()?.category || '')
  readonly application = computed(() => this.templateItem()?.application ?? null)
  readonly applicationScreenshot = computed(() => this.application()?.config.presentation?.screenshots?.[0] ?? null)
  readonly type = computed<TXpertTemplate['type'] | IXpert['type'] | null>(
    () => this.mineItem()?.type || this.templateItem()?.type || null
  )
  readonly avatar = computed(() => this.mineItem()?.avatar || this.templateItem()?.avatar)
  readonly displayDate = computed(() => this.mineItem()?.updatedAt || this.mineItem()?.createdAt || null)
  readonly creator = computed(() => {
    const item = this.mineItem()
    return item?.createdBy?.fullName || item?.createdBy?.name || item?.createdBy?.email || '-'
  })

  readonly articleClass = computed(() => {
    const interactiveClass = this.isMine() ? 'cursor-pointer' : ''
    return `group flex h-full flex-col overflow-hidden rounded-xl border border-divider-regular bg-components-card-bg shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg ${interactiveClass}`.trim()
  })

  readonly headerClass = computed(() => 'flex items-start gap-3 border-b border-divider-regular p-5 pb-2')

  readonly avatarClass = computed(() => 'overflow-hidden rounded-2xl shadow-sm')

  readonly badgeClass = computed(
    () =>
      'absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-divider-regular bg-components-card-bg text-text-secondary shadow-sm'
  )

  handleCardClick() {
    if (this.isMine() || this.application()) {
      this.cardClick.emit()
    }
  }

  handleCardKeydown(event: KeyboardEvent) {
    if ((!this.isMine() && !this.application()) || (event.key !== 'Enter' && event.key !== ' ')) {
      return
    }

    event.preventDefault()
    this.cardClick.emit()
  }

  applicationActionLabel() {
    if (this.applicationStatus()?.status !== 'ready') {
      if (this.applicationStatus()?.initializationAccess === 'role_required') {
        return this.#translate.instant('XP.Explore.Application.Action.ContactAdministrator', {
          Default: 'Contact administrator'
        })
      }
      if (this.applicationStatus()?.initializationAccess === 'organization_required') {
        return this.#translate.instant('XP.Explore.Application.Action.SwitchOrganization', {
          Default: 'Switch organization'
        })
      }
      if (this.applicationStatus()?.initializationAccess === 'unsupported') {
        return this.#translate.instant('XP.Explore.Application.Action.NotSupported', { Default: 'Not supported yet' })
      }
    }
    switch (this.applicationStatus()?.status) {
      case 'ready':
        return this.#translate.instant('XP.Explore.Application.Action.Open', { Default: 'Open application' })
      case 'initializing':
        return this.#translate.instant('XP.Explore.Application.Action.Initializing', { Default: 'Initializing…' })
      case 'degraded':
        return this.#translate.instant('XP.Explore.Application.Action.Repair', { Default: 'Repair application' })
      default:
        return this.#translate.instant('XP.Explore.Application.Action.ApplyToOrganization', {
          Default: 'Apply to current organization'
        })
    }
  }

  applicationScopeLabel() {
    switch (this.application()?.scope) {
      case 'tenant':
        return this.#translate.instant('XP.Explore.Application.Scope.Tenant', { Default: 'Tenant' })
      case 'personal':
        return this.#translate.instant('XP.Explore.Application.Scope.Personal', { Default: 'Personal' })
      default:
        return this.#translate.instant('XP.Explore.Application.Scope.Organization', { Default: 'Organization' })
    }
  }

  applicationInitializationLabel() {
    return this.application()?.scope === 'organization'
      ? this.#translate.instant('XP.Explore.Application.GovernedInitialization', {
          Default: 'Governed initialization'
        })
      : this.#translate.instant('XP.Explore.Application.InitializationUnavailable', {
          Default: 'Initialization not available'
        })
  }

  applicationScopeDescription() {
    return this.#translate.instant('XP.Explore.Application.ScopeApplication', {
      Default: '{{scope}} application',
      scope: this.applicationScopeLabel()
    })
  }

  applicationScreenshotAlt() {
    return this.#translate.instant('XP.Explore.Application.ScreenshotAlt', {
      Default: 'Screenshot of {{app}}',
      app: this.title()
    })
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
