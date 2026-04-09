import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  IKnowledgebase,
  injectToastr,
  IXpertWorkspace,
  KnowledgebaseService,
  OrderTypeEnum,
  TKnowledgePipelineTemplate,
  XpertTemplateService
} from '@cloud/app/@core'
import { EmojiAvatarComponent, IconComponent } from '@cloud/app/@shared/avatar'

type ExploreViewMode = 'square' | 'mine'

@Component({
  standalone: true,
  selector: 'xp-explore-inspirations',
  imports: [CommonModule, TranslateModule, IconComponent, EmojiAvatarComponent],
  templateUrl: './inspirations.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreInspirationsComponent {
  readonly search = input('')
  readonly mode = input<ExploreViewMode>('square')
  readonly workspace = input<IXpertWorkspace | null>(null)

  readonly #templateService = inject(XpertTemplateService)
  readonly #knowledgebaseService = inject(KnowledgebaseService)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()

  readonly loadingTemplates = signal(true)
  readonly loadingMine = signal(false)
  readonly templateItems = signal<TKnowledgePipelineTemplate[]>([])
  readonly mineItems = signal<IKnowledgebase[]>([])

  readonly items = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.templateItems()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.name, item.description, item.author, item.category, ...(item.tags ?? [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })

  readonly myItems = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.mineItems()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.name, item.description, item.createdBy?.fullName, item.createdBy?.name, item.createdBy?.email]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })

  readonly loading = computed(() => (this.mode() === 'mine' ? this.loadingMine() : this.loadingTemplates()))

  #mineQueryVersion = 0
  readonly #templatesLoaded = signal(false)

  constructor() {
    effect(
      () => {
        if (this.mode() !== 'square' || this.#templatesLoaded()) {
          return
        }

        this.#templatesLoaded.set(true)
        void this.loadTemplates()
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.mode() !== 'mine') {
          return
        }

        void this.loadMineItems(this.workspace()?.id ?? null)
      },
      { allowSignalWrites: true }
    )
  }

  async loadTemplates() {
    this.loadingTemplates.set(true)
    try {
      const result = await firstValueFrom(this.#templateService.getAllKnowledgePipelines({}))
      this.templateItems.set(result?.templates ?? [])
    } catch (error) {
      this.templateItems.set([])
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.loadingTemplates.set(false)
    }
  }

  async loadMineItems(workspaceId: string | null) {
    const version = ++this.#mineQueryVersion
    this.mineItems.set([])

    if (!workspaceId) {
      this.loadingMine.set(false)
      return
    }

    this.loadingMine.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#knowledgebaseService.getAllByWorkspace(workspaceId, {
          relations: ['createdBy'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )

      if (version !== this.#mineQueryVersion) {
        return
      }

      this.mineItems.set(items ?? [])
    } catch (error) {
      if (version === this.#mineQueryVersion) {
        this.mineItems.set([])
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (version === this.#mineQueryVersion) {
        this.loadingMine.set(false)
      }
    }
  }

  openMineItem(item: IKnowledgebase) {
    this.#router.navigate(['/xpert/knowledges', item.id])
  }

  onMineCardKeydown(event: KeyboardEvent, item: IKnowledgebase) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    this.openMineItem(item)
  }

  openMineWorkspace(event?: Event) {
    event?.stopPropagation()

    const workspaceId = this.workspace()?.id
    if (!workspaceId) {
      return
    }

    this.#router.navigate(['/xpert/w', workspaceId, 'knowledges'])
  }

  creatorName(item: IKnowledgebase) {
    return item.createdBy?.fullName || item.createdBy?.name || item.createdBy?.email || '-'
  }
}
