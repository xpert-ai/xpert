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
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  injectToastr,
  IXpertMarketplaceItem,
  IXpertWorkspace,
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
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)

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

  async loadMarketplace(query = this.currentQuery()) {
    const version = ++this.#queryVersion
    this.loading.set(true)

    try {
      const result = await firstValueFrom(this.#service.findMarketplace(query))
      if (version !== this.#queryVersion) {
        return
      }

      this.items.set(result.items ?? [])
      this.recommendedTemplates.set(result.recommendedTemplates ?? [])
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
    return `PAC.Plugin.MarketplaceCategory_${category}`
  }

  collaborationLabelKey(mode: TXpertMarketplaceCollaborationMode) {
    return `PAC.Explore.AgentSquare.Collaboration.${mode}`
  }

  technicalLabelKey(category: TXpertMarketplaceTechnicalCategory) {
    return `PAC.Explore.AgentSquare.Technical.${category}`
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
