import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { Router } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import {
  getErrorMessage,
  IXpert,
  IXpertProject,
  IXpertWorkspace,
  injectToastr,
  OrderTypeEnum,
  TXpertTemplate,
  XpertAPIService,
  XpertTemplateService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertProjectInstallComponent } from '@cloud/app/@shared/chat'
import { NgmHighlightDirective, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ExploreAgentInstallComponent } from './install/install.component'
import { ZardButtonComponent, ZardTooltipDirective } from '@xpert-ai/headless-ui'

type ExploreViewMode = 'square' | 'mine'

@Component({
  standalone: true,
  selector: 'xp-explore-agents',
  imports: [CommonModule, TranslateModule, NgmSpinComponent, NgmHighlightDirective, EmojiAvatarComponent, ZardButtonComponent, ZardTooltipDirective],
  templateUrl: './agents.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreAgentsComponent {
  readonly search = input('')
  readonly mode = input<ExploreViewMode>('square')
  readonly workspace = input<IXpertWorkspace | null>(null)
  readonly eXpertTypeEnum = XpertTypeEnum

  readonly #templateService = inject(XpertTemplateService)
  readonly #xpertService = inject(XpertAPIService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #toastr = injectToastr()

  readonly loadingTemplates = signal(true)
  readonly loadingMine = signal(false)
  readonly templateItems = signal<TXpertTemplate[]>([])
  readonly mineItems = signal<IXpert[]>([])

  readonly items = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.templateItems()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.name, item.description, item.category].filter(Boolean).join(' ').toLowerCase().includes(term)
    )
  })

  readonly myItems = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.mineItems()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [item.title, item.name, item.description, item.createdBy?.fullName, item.createdBy?.name, item.createdBy?.email]
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
      const result = await firstValueFrom(this.#templateService.getAll())
      this.templateItems.set(result?.recommendedApps ?? [])
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
        this.#xpertService.getAllByWorkspace(workspaceId, {
          where: { latest: true },
          order: { updatedAt: OrderTypeEnum.DESC },
          relations: ['createdBy', 'knowledgebase']
        })
      )

      if (version !== this.#mineQueryVersion) {
        return
      }

      this.mineItems.set(
        (items ?? []).filter((item) => item.latest && [XpertTypeEnum.Agent, XpertTypeEnum.Copilot].includes(item.type))
      )
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

  install(item: TXpertTemplate) {
    if (item.type === XpertTypeEnum.Agent || item.type === XpertTypeEnum.Copilot) {
      this.#dialog.open(ExploreAgentInstallComponent, {
        data: item
      })
      return
    }

    if (item.type === 'project') {
      this.#dialog
        .open<IXpertProject>(XpertProjectInstallComponent, {
          data: {
            template: item
          }
        })
        .closed.subscribe({
          next: (project) => {
            if (project) {
              this.#router.navigate(['/project', project.id])
            }
          }
        })
    }
  }

  openMineItem(item: IXpert) {
    this.#router.navigate(item.type === XpertTypeEnum.Copilot ? ['/xpert/x', item.id, 'copilot'] : ['/xpert/x', item.id])
  }

  onMineCardKeydown(event: KeyboardEvent, item: IXpert) {
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

    this.#router.navigate(['/xpert/w', workspaceId, 'xperts'])
  }

  creatorName(item: IXpert) {
    return item.createdBy?.fullName || item.createdBy?.name || item.createdBy?.email || '-'
  }

  typeLabel(type: TXpertTemplate['type'] | IXpert['type']) {
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

  typeIcon(type: TXpertTemplate['type'] | IXpert['type']) {
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
