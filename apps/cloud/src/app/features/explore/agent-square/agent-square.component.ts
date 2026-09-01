import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  effect,
  inject,
  input,
  signal
} from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  injectToastr,
  IXpertMarketplaceItem,
  IXpertWorkspace,
  PluginApplicationService,
  PluginApplicationStatusSummary,
  TXpertMarketplaceBusinessCategory,
  TXpertMarketplaceCollaborationMode,
  TXpertMarketplaceTechnicalCategory,
  TXpertTemplate,
  XpertMarketplaceBusinessCategories,
  XpertMarketplaceCollaborationModes,
  XpertMarketplaceService,
  XpertMarketplaceTechnicalCategories
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { ZardButtonComponent, ZardCheckboxComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ExploreAgentsComponent } from '../agents/agents.component'
import { createAgentTemplateWizardData } from '../agents/agent-template-wizard'
import { type BlankXpertWizardResult, XpertNewBlankComponent } from '../../xpert/xpert'
import { AgentSquareAccessRequestDialogComponent } from './access-request-dialog.component'
import { AgentSquareReviewRequestsDialogComponent } from './review-requests-dialog.component'

type AgentSquareSort = 'match' | 'hot' | 'updated'

/** Discriminates installable templates from already published marketplace Assistants. */
type AgentSquareDisplayItem =
  | { kind: 'template'; id: string; template: TXpertTemplate }
  | { kind: 'published'; id: string; published: IXpertMarketplaceItem }
type AgentSquareTemplateDisplayItem = Extract<AgentSquareDisplayItem, { kind: 'template' }>

@Component({
  standalone: true,
  selector: 'xp-explore-agent-square',
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    EmojiAvatarComponent,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ExploreAgentsComponent
  ],
  templateUrl: './agent-square.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreAgentSquareComponent {
  readonly search = input('')
  readonly workspace = input<IXpertWorkspace | null>(null)

  readonly #service = inject(XpertMarketplaceService)
  readonly #applicationService = inject(PluginApplicationService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)
  readonly #translate = inject(TranslateService)

  readonly businessCategories = XpertMarketplaceBusinessCategories
  readonly collaborationModes = XpertMarketplaceCollaborationModes
  readonly technicalCategories = XpertMarketplaceTechnicalCategories
  readonly sortOptions: AgentSquareSort[] = ['match', 'hot', 'updated']

  readonly selectedBusinessCategories = signal<TXpertMarketplaceBusinessCategory[]>([])
  readonly selectedCollaborationModes = signal<TXpertMarketplaceCollaborationMode[]>([])
  readonly selectedTechnicalCategories = signal<TXpertMarketplaceTechnicalCategory[]>([])
  readonly sort = signal<AgentSquareSort>('match')

  readonly items = signal<IXpertMarketplaceItem[]>([])
  readonly recommendedTemplates = signal<TXpertTemplate[]>([])
  readonly applicationStatuses = signal<PluginApplicationStatusSummary[]>([])
  readonly total = signal(0)
  readonly reviewableCount = signal(0)
  readonly loading = signal(false)
  readonly selectedId = signal<string | null>(null)
  readonly featuredIndex = signal(0)

  readonly activeFilterCount = computed(
    () =>
      this.selectedBusinessCategories().length +
      this.selectedCollaborationModes().length +
      this.selectedTechnicalCategories().length
  )

  readonly recommendedItems = computed<AgentSquareTemplateDisplayItem[]>(() =>
    this.recommendedTemplates().map((template) => ({ kind: 'template', id: `template:${template.id}`, template }))
  )

  readonly displayItems = computed<AgentSquareDisplayItem[]>(() =>
    this.items().map((published) => ({
      kind: 'published',
      id: `published:${published.xpert.id}`,
      published
    }))
  )

  readonly featuredItem = computed(() => {
    const items = this.recommendedItems()
    return items.length ? items[this.featuredIndex() % items.length] : null
  })

  workspaceAvatar(item: AgentSquareDisplayItem) {
    return item.kind === 'published' ? item.published.xpert.avatar : undefined
  }

  readonly selectedItem = computed(() => {
    const selectedId = this.selectedId()
    return (
      this.displayItems().find((item) => item.id === selectedId) ??
      this.recommendedItems().find((item) => item.id === selectedId) ??
      this.displayItems()[0] ??
      this.recommendedItems()[0] ??
      null
    )
  })

  #queryVersion = 0
  #carouselTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    effect(
      () => {
        const query = {
          search: this.search(),
          businessCategories: this.selectedBusinessCategories(),
          collaborationModes: this.selectedCollaborationModes(),
          technicalCategories: this.selectedTechnicalCategories(),
          sort: this.sort(),
          take: 60
        }

        void this.loadMarketplace(query)
      },
      { allowSignalWrites: true }
    )

    this.#destroyRef.onDestroy(() => this.pauseHeroCarousel())
  }

  /**
   * Loads marketplace content and App installation state as one versioned UI
   * transaction. The version guard prevents a slower previous filter request
   * from replacing newer results while its status request is still pending.
   */
  async loadMarketplace(query = this.currentQuery()) {
    const version = ++this.#queryVersion
    this.loading.set(true)

    try {
      const [result, applicationStatuses] = await Promise.all([
        firstValueFrom(this.#service.findMarketplace(query)),
        firstValueFrom(this.#applicationService.getStatuses()).catch(() => [])
      ])
      if (version !== this.#queryVersion) {
        return
      }

      this.items.set(result.items ?? [])
      this.recommendedTemplates.set(result.recommendedTemplates ?? [])
      this.applicationStatuses.set(applicationStatuses)
      this.featuredIndex.set(0)
      this.restartHeroCarousel()
      this.total.set(result.total ?? 0)
      this.reviewableCount.set(result.reviewableCount ?? 0)
      if (![...this.displayItems(), ...this.recommendedItems()].some((item) => item.id === this.selectedId())) {
        this.selectedId.set(this.displayItems()[0]?.id ?? this.recommendedItems()[0]?.id ?? null)
      }
    } catch (error) {
      if (version === this.#queryVersion) {
        this.items.set([])
        this.recommendedTemplates.set([])
        this.pauseHeroCarousel()
        this.total.set(0)
        this.reviewableCount.set(0)
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (version === this.#queryVersion) {
        this.loading.set(false)
      }
    }
  }

  setSort(sort: AgentSquareSort) {
    this.sort.set(sort)
  }

  resetFilters() {
    this.selectedBusinessCategories.set([])
    this.selectedCollaborationModes.set([])
    this.selectedTechnicalCategories.set([])
  }

  toggleBusinessCategory(category: TXpertMarketplaceBusinessCategory) {
    this.toggle(this.selectedBusinessCategories, category)
  }

  toggleCollaborationMode(mode: TXpertMarketplaceCollaborationMode) {
    this.toggle(this.selectedCollaborationModes, mode)
  }

  toggleTechnicalCategory(category: TXpertMarketplaceTechnicalCategory) {
    this.toggle(this.selectedTechnicalCategories, category)
  }

  selectItem(item: AgentSquareDisplayItem) {
    this.selectedId.set(item.id)
    if (item.kind === 'template') {
      const index = this.recommendedItems().findIndex((candidate) => candidate.id === item.id)
      if (index >= 0) {
        this.showHeroItem(index)
      }
    }
  }

  showHeroItem(index: number) {
    this.updateFeaturedIndex(index)
    this.restartHeroCarousel()
  }

  pauseHeroCarousel() {
    if (this.#carouselTimer !== null) {
      clearInterval(this.#carouselTimer)
      this.#carouselTimer = null
    }
  }

  resumeHeroCarousel() {
    this.startHeroCarousel()
  }

  async handlePrimaryAction(item: AgentSquareDisplayItem, event?: Event) {
    event?.stopPropagation()
    if (item.kind === 'template') {
      if (item.template.application) {
        const status = this.applicationStatus(item.template)
        if (status?.status === 'ready' && status.assistantSlug) {
          void this.#router.navigate(['/chat/x', status.assistantSlug, 'c'])
        } else {
          void this.#router.navigate(['/explore/apps', item.template.application.appName], {
            queryParams: { plugin: item.template.application.pluginName, setup: 1 }
          })
        }
        return
      }
      this.openTemplateWizard(item.template)
      return
    }

    const published = item.published
    if (this.canUse(item)) {
      this.openChat(published)
      return
    }
    if (published.accessStatus === 'requested') {
      return
    }

    const reason = await firstValueFrom(
      this.#dialog.open<string | null>(AgentSquareAccessRequestDialogComponent, { data: { item: published } }).closed
    )
    if (reason == null) {
      return
    }

    try {
      await firstValueFrom(
        this.#service.requestAccess(published.xpert.id, {
          reason
        })
      )
      await this.loadMarketplace()
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async openReviewDialog() {
    const changed = await firstValueFrom(
      this.#dialog.open<boolean>(AgentSquareReviewRequestsDialogComponent, {
        minWidth: 320
      }).closed
    )
    if (changed) {
      await this.loadMarketplace()
    }
  }

  openChat(item: IXpertMarketplaceItem) {
    this.#router.navigate(['/chat/x', item.xpert.slug, 'c'])
  }

  private openTemplateWizard(template: TXpertTemplate) {
    this.#dialog
      .open<BlankXpertWizardResult>(XpertNewBlankComponent, {
        disableClose: true,
        data: createAgentTemplateWizardData(template.id, this.workspace())
      })
      .closed.subscribe((result) => {
        if (result?.xpert?.id) {
          void this.#router.navigate(['/xpert/x', result.xpert.id])
        }
      })
  }

  canUse(item: AgentSquareDisplayItem) {
    return item.kind === 'published' && ['owned', 'accessible', 'approved'].includes(item.published.accessStatus)
  }

  isPending(item: AgentSquareDisplayItem) {
    return item.kind === 'published' && item.published.accessStatus === 'requested'
  }

  isTemplate(item: AgentSquareDisplayItem) {
    return item.kind === 'template'
  }

  applicationStatus(template: TXpertTemplate) {
    return template.application
      ? (this.applicationStatuses().find((status) => status.appId === template.application?.id) ?? null)
      : null
  }

  templateActionLabel(item: AgentSquareDisplayItem) {
    if (item.kind !== 'template' || !item.template.application) {
      return this.#translate.instant('XP.Explore.AgentSquare.UseNow', { Default: 'Use now' })
    }
    const status = this.applicationStatus(item.template)
    if (status?.status !== 'ready') {
      if (status?.initializationAccess === 'role_required') {
        return this.#translate.instant('XP.Explore.Application.Action.ContactAdministrator', {
          Default: 'Contact administrator'
        })
      }
      if (status?.initializationAccess === 'organization_required') {
        return this.#translate.instant('XP.Explore.Application.Action.SwitchOrganization', {
          Default: 'Switch organization'
        })
      }
      if (status?.initializationAccess === 'unsupported') {
        return this.#translate.instant('XP.Explore.Application.Action.NotSupported', { Default: 'Not supported yet' })
      }
    }
    switch (status?.status) {
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

  applicationScreenshot(item: AgentSquareDisplayItem | null) {
    return item?.kind === 'template' ? (item.template.application?.config.presentation?.screenshots?.[0] ?? null) : null
  }

  applicationScreenshotAlt(item: AgentSquareDisplayItem | null) {
    return this.#translate.instant('XP.Explore.Application.ScreenshotAlt', {
      Default: 'Screenshot of {{app}}',
      app: this.title(item)
    })
  }

  title(item: AgentSquareDisplayItem | null) {
    if (!item) {
      return ''
    }
    return item.kind === 'template'
      ? item.template.title || item.template.name
      : item.published.xpert.title || item.published.xpert.titleCN || item.published.xpert.name
  }

  summary(item: AgentSquareDisplayItem | null) {
    if (!item) {
      return ''
    }
    return item.kind === 'template'
      ? item.template.description || ''
      : item.published.marketplace.summary || item.published.xpert.description || ''
  }

  initials(item: AgentSquareDisplayItem) {
    const label =
      this.title(item) || (item.kind === 'template' ? item.template.name : item.published.xpert.slug) || 'AI'
    return label
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toLowerCase()
  }

  matchScore(item: AgentSquareDisplayItem) {
    if (item.kind === 'template') {
      const index = this.recommendedItems().findIndex((candidate) => candidate.id === item.id)
      return Math.max(80, 92 - Math.max(index, 0) * 3)
    }

    const technical = item.published.marketplace.technical
    const raw =
      78 +
      (item.published.marketplace.businessCategories?.length ?? 0) * 3 +
      (technical?.categories.length ?? 0) * 2 +
      (technical?.agentCount ?? 0)
    return Math.min(raw, 98)
  }

  capabilityWidth(item: AgentSquareDisplayItem | null, capability: 'knowledge' | 'tools' | 'execution') {
    const technical = item?.kind === 'published' ? item.published.marketplace.technical : null
    if (!technical) {
      return 30
    }

    if (capability === 'knowledge') {
      return technical.categories.includes('knowledge-retrieval')
        ? 92
        : Math.min(42 + technical.knowledgebaseCount * 14, 76)
    }
    if (capability === 'tools') {
      return technical.categories.includes('tool-calling') ? 88 : Math.min(36 + technical.toolsetCount * 14, 72)
    }
    return Math.min(50 + technical.agentCount * 10 + technical.workflowNodeCount * 5, 94)
  }

  businessLabelKey(category: TXpertMarketplaceBusinessCategory) {
    return `XP.Plugin.MarketplaceCategory_${category}`
  }

  collaborationLabelKey(mode: TXpertMarketplaceCollaborationMode) {
    return `XP.Explore.AgentSquare.Collaboration.${mode}`
  }

  technicalLabelKey(category: TXpertMarketplaceTechnicalCategory) {
    return `XP.Explore.AgentSquare.Technical.${category}`
  }

  capabilityTags(item: AgentSquareDisplayItem) {
    return item.kind === 'template'
      ? [item.template.category].filter(Boolean)
      : (item.published.marketplace.capabilityTags ?? [])
  }

  itemTechnicalCategories(item: AgentSquareDisplayItem) {
    return item.kind === 'published' ? (item.published.marketplace.technical?.categories ?? []) : []
  }

  profileCount(item: AgentSquareDisplayItem, field: 'agentCount' | 'toolsetCount' | 'workflowNodeCount') {
    return item.kind === 'published' ? (item.published.marketplace.technical?.[field] ?? 0) : 0
  }

  private currentQuery() {
    return {
      search: this.search(),
      businessCategories: this.selectedBusinessCategories(),
      collaborationModes: this.selectedCollaborationModes(),
      technicalCategories: this.selectedTechnicalCategories(),
      sort: this.sort(),
      take: 60
    }
  }

  private updateFeaturedIndex(index: number) {
    const itemCount = this.recommendedItems().length
    this.featuredIndex.set(itemCount ? (index + itemCount) % itemCount : 0)
  }

  private restartHeroCarousel() {
    this.pauseHeroCarousel()
    this.startHeroCarousel()
  }

  private startHeroCarousel() {
    if (
      this.#carouselTimer !== null ||
      this.recommendedItems().length < 2 ||
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      return
    }

    this.#carouselTimer = setInterval(() => this.updateFeaturedIndex(this.featuredIndex() + 1), 6000)
  }

  private toggle<T extends string>(signalValue: WritableSignal<T[]>, value: T) {
    signalValue.update((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]))
  }
}
