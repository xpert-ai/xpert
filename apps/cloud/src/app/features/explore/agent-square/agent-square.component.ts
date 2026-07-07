import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
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
  XpertMarketplaceBusinessCategories,
  XpertMarketplaceCollaborationModes,
  XpertMarketplaceService,
  XpertMarketplaceTechnicalCategories
} from '@cloud/app/@core'
import { ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { ExploreAgentsComponent } from '../agents/agents.component'
import { AgentSquareAccessRequestDialogComponent } from './access-request-dialog.component'
import { AgentSquareReviewRequestsDialogComponent } from './review-requests-dialog.component'

type AgentSquareSort = 'match' | 'hot' | 'updated'

@Component({
  standalone: true,
  selector: 'xp-explore-agent-square',
  imports: [CommonModule, TranslateModule, ZardButtonComponent, ZardIconComponent, ExploreAgentsComponent],
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

  readonly businessCategories = XpertMarketplaceBusinessCategories
  readonly collaborationModes = XpertMarketplaceCollaborationModes
  readonly technicalCategories = XpertMarketplaceTechnicalCategories
  readonly sortOptions: AgentSquareSort[] = ['match', 'hot', 'updated']

  readonly selectedBusinessCategories = signal<TXpertMarketplaceBusinessCategory[]>([])
  readonly selectedCollaborationModes = signal<TXpertMarketplaceCollaborationMode[]>([])
  readonly selectedTechnicalCategories = signal<TXpertMarketplaceTechnicalCategory[]>([])
  readonly sort = signal<AgentSquareSort>('match')

  readonly items = signal<IXpertMarketplaceItem[]>([])
  readonly total = signal(0)
  readonly reviewableCount = signal(0)
  readonly loading = signal(false)
  readonly selectedId = signal<string | null>(null)

  readonly selectedItem = computed(() => {
    const selectedId = this.selectedId()
    return this.items().find((item) => item.xpert.id === selectedId) ?? this.items()[0] ?? null
  })

  readonly activeFilterCount = computed(
    () =>
      this.selectedBusinessCategories().length +
      this.selectedCollaborationModes().length +
      this.selectedTechnicalCategories().length
  )

  #queryVersion = 0

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
      this.total.set(result.total ?? 0)
      this.reviewableCount.set(result.reviewableCount ?? 0)
      if (!this.items().some((item) => item.xpert.id === this.selectedId())) {
        this.selectedId.set(this.items()[0]?.xpert.id ?? null)
      }
    } catch (error) {
      if (version === this.#queryVersion) {
        this.items.set([])
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

  selectItem(item: IXpertMarketplaceItem) {
    this.selectedId.set(item.xpert.id ?? null)
  }

  async handlePrimaryAction(item: IXpertMarketplaceItem, event?: Event) {
    event?.stopPropagation()
    if (this.canUse(item)) {
      this.openChat(item)
      return
    }
    if (item.accessStatus === 'requested') {
      return
    }

    const reason = await firstValueFrom(
      this.#dialog.open<string | null>(AgentSquareAccessRequestDialogComponent, { data: { item } }).closed
    )
    if (reason == null) {
      return
    }

    try {
      await firstValueFrom(
        this.#service.requestAccess(item.xpert.id, {
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

  canUse(item: IXpertMarketplaceItem) {
    return item.accessStatus === 'owned' || item.accessStatus === 'accessible' || item.accessStatus === 'approved'
  }

  isPending(item: IXpertMarketplaceItem) {
    return item.accessStatus === 'requested'
  }

  title(item: IXpertMarketplaceItem | null) {
    if (!item) {
      return ''
    }
    return item.xpert.title || item.xpert.titleCN || item.xpert.name
  }

  summary(item: IXpertMarketplaceItem | null) {
    return item?.marketplace.summary || item?.xpert.description || ''
  }

  initials(item: IXpertMarketplaceItem) {
    const label = this.title(item) || item.xpert.slug || 'AI'
    return label
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .slice(0, 2)
      .toLowerCase()
  }

  matchScore(item: IXpertMarketplaceItem) {
    const technical = item.marketplace.technical
    const raw =
      78 +
      (item.marketplace.businessCategories?.length ?? 0) * 3 +
      (technical?.categories.length ?? 0) * 2 +
      (technical?.agentCount ?? 0)
    return Math.min(raw, 98)
  }

  capabilityWidth(item: IXpertMarketplaceItem | null, capability: 'knowledge' | 'tools' | 'execution') {
    const technical = item?.marketplace.technical
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
    return `PAC.Explore.AgentSquare.Business.${category}`
  }

  collaborationLabelKey(mode: TXpertMarketplaceCollaborationMode) {
    return `PAC.Explore.AgentSquare.Collaboration.${mode}`
  }

  technicalLabelKey(category: TXpertMarketplaceTechnicalCategory) {
    return `PAC.Explore.AgentSquare.Technical.${category}`
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

  private toggle<T extends string>(signalValue: WritableSignal<T[]>, value: T) {
    signalValue.update((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]))
  }
}
