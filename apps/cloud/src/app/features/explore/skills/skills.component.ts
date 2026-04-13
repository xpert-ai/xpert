import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { Router, RouterModule } from '@angular/router'
import { firstValueFrom } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { WaIntersectionObserver } from '@ng-web-apis/intersection-observer'
import { ZardSelectImports } from '@xpert-ai/headless-ui'
import {
  getErrorMessage,
  injectToastr,
  ISkillMarketConfig,
  ISkillMarketFeaturedSkill,
  ISkillPackage,
  ISkillRepository,
  ISkillRepositoryIndex,
  ISkillMarketFilterGroup,
  IXpertWorkspace,
  OrderTypeEnum,
  SkillPackageService,
  SkillRepositoryIndexService,
  SkillRepositoryService,
  XpertTemplateService
} from '@cloud/app/@core'
import { ExploreSkillCardComponent } from './card/skill-card.component'
import { ExploreSkillDetailDialogComponent } from './detail/detail-dialog.component'
import { ExploreSkillInstallComponent } from './install/install.component'
import { ExploreSkillShareDialogComponent } from './share/share-dialog.component'

const ALL_REPOSITORIES = '__all__'
const PAGE_SIZE = 20
type ExploreViewMode = 'square' | 'mine'

const EMPTY_FILTER_GROUP: ISkillMarketFilterGroup = {
  label: '',
  options: []
}

@Component({
  standalone: true,
  selector: 'xp-explore-skills',
  imports: [
    CommonModule,
    RouterModule,
    TranslateModule,
    WaIntersectionObserver,
    ...ZardSelectImports,
    ExploreSkillCardComponent
  ],
  templateUrl: './skills.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreSkillsComponent {
  readonly search = input('')
  readonly mode = input<ExploreViewMode>('square')
  readonly workspace = input<IXpertWorkspace | null>(null)

  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #repositoryService = inject(SkillRepositoryService)
  readonly #indexService = inject(SkillRepositoryIndexService)
  readonly #templateService = inject(XpertTemplateService)
  readonly #skillPackageService = inject(SkillPackageService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)

  readonly repositories = signal<ISkillRepository[]>([])
  readonly market = signal<ISkillMarketConfig | null>(null)
  readonly installedSkills = signal<ISkillPackage[]>([])
  readonly selectedRepositoryId = signal<string>(ALL_REPOSITORIES)
  readonly selectedRole = signal('all')
  readonly selectedAppType = signal('all')
  readonly selectedHot = signal('all')
  readonly skills = signal<ISkillRepositoryIndex[]>([])
  readonly total = signal(0)
  readonly loadingRepositories = signal(true)
  readonly loadingMarket = signal(false)
  readonly loadingSkills = signal(false)
  readonly loadingMore = signal(false)
  readonly loadingInstalledSkills = signal(false)
  readonly installingSkillId = signal<string | null>(null)

  readonly featuredSkills = computed(() => this.market()?.featured ?? [])
  readonly selectedRepository = computed(() =>
    this.repositories().find((repository) => repository.id === this.selectedRepositoryId()) ?? null
  )
  readonly repositoryCount = computed(() => this.repositories().length)
  readonly hasMore = computed(() => this.skills().length < this.total())
  readonly mineSkills = computed(() => {
    const term = this.search().trim().toLowerCase()
    const items = this.installedSkills()

    if (!term) {
      return items
    }

    return items.filter((item) =>
      [
        this.displayInstalledSkillName(item),
        this.installedSkillSummary(item),
        this.installedSkillRepositoryLabel(item),
        this.installedSkillProviderLabel(item),
        this.installedSkillPublisherLabel(item),
        ...(item.metadata?.tags ?? []),
        ...(item.skillIndex?.tags ?? []),
        item.skillIndex?.skillId,
        item.packagePath
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  })

  readonly roleFilterGroup = computed(() => this.market()?.filters.roles ?? EMPTY_FILTER_GROUP)
  readonly appTypeFilterGroup = computed(() => this.market()?.filters.appTypes ?? EMPTY_FILTER_GROUP)
  readonly hotFilterGroup = computed(() => this.market()?.filters.hot ?? EMPTY_FILTER_GROUP)

  readonly roleOptions = computed(() =>
    this.roleFilterGroup().options.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }))
  )
  readonly appTypeOptions = computed(() =>
    this.appTypeFilterGroup().options.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }))
  )
  readonly hotOptions = computed(() =>
    this.hotFilterGroup().options.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description
    }))
  )

  #queryVersion = 0
  #mineQueryVersion = 0
  readonly #squareInitialized = signal(false)

  constructor() {
    effect(
      () => {
        if (this.mode() !== 'square') {
          return
        }

        const repositoryId = this.selectedRepositoryId()
        const search = this.search().trim()
        void this.resetAndLoad(repositoryId, search)
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.mode() !== 'square' || this.#squareInitialized()) {
          return
        }

        this.#squareInitialized.set(true)
        void this.initializeSquare()
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.mode() !== 'mine') {
          return
        }

        void this.loadInstalledSkills(this.workspace()?.id ?? null)
      },
      { allowSignalWrites: true }
    )
  }

  async initializeSquare() {
    await Promise.all([this.loadRepositories(), this.loadMarket()])
  }

  async loadRepositories() {
    this.loadingRepositories.set(true)
    try {
      const { items } = await firstValueFrom(this.#repositoryService.getAvailables())
      this.repositories.set(items ?? [])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      this.repositories.set([])
    } finally {
      this.loadingRepositories.set(false)
    }
  }

  async loadMarket() {
    this.loadingMarket.set(true)
    try {
      const market = await firstValueFrom(this.#templateService.getSkillsMarket())
      this.market.set(market)
      this.selectedRole.set(market.filters.roles.options[0]?.value ?? 'all')
      this.selectedAppType.set(market.filters.appTypes.options[0]?.value ?? 'all')
      this.selectedHot.set(market.filters.hot.options[0]?.value ?? 'all')
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
      this.market.set(null)
    } finally {
      this.loadingMarket.set(false)
    }
  }

  async loadInstalledSkills(workspaceId: string | null) {
    const version = ++this.#mineQueryVersion
    this.installedSkills.set([])

    if (!workspaceId) {
      this.loadingInstalledSkills.set(false)
      return
    }

    this.loadingInstalledSkills.set(true)
    try {
      const { items } = await firstValueFrom(
        this.#skillPackageService.getAllByWorkspace(workspaceId, {
          relations: ['skillIndex', 'skillIndex.repository'],
          order: { updatedAt: OrderTypeEnum.DESC }
        })
      )

      if (version !== this.#mineQueryVersion) {
        return
      }

      this.installedSkills.set(items ?? [])
    } catch (error) {
      if (version === this.#mineQueryVersion) {
        this.installedSkills.set([])
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (version === this.#mineQueryVersion) {
        this.loadingInstalledSkills.set(false)
      }
    }
  }

  async resetAndLoad(repositoryId: string, search: string) {
    const version = ++this.#queryVersion
    this.skills.set([])
    this.total.set(0)
    this.loadingSkills.set(true)

    try {
      const { items, total } = await firstValueFrom(this.#indexService.getMarketplace({
        where: repositoryId === ALL_REPOSITORIES ? undefined : { repositoryId },
        take: PAGE_SIZE,
        skip: 0
      }, search))

      if (version !== this.#queryVersion) {
        return
      }

      this.skills.set(items ?? [])
      this.total.set(total ?? 0)
    } catch (error) {
      if (version === this.#queryVersion) {
        this.skills.set([])
        this.total.set(0)
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (version === this.#queryVersion) {
        this.loadingSkills.set(false)
      }
    }
  }

  async loadMore() {
    if (this.loadingSkills() || this.loadingMore() || !this.hasMore()) {
      return
    }

    const version = this.#queryVersion
    this.loadingMore.set(true)

    try {
      const { items, total } = await firstValueFrom(this.#indexService.getMarketplace({
        where: this.selectedRepositoryId() === ALL_REPOSITORIES ? undefined : { repositoryId: this.selectedRepositoryId() },
        take: PAGE_SIZE,
        skip: this.skills().length
      }, this.search().trim()))

      if (version !== this.#queryVersion) {
        return
      }

      this.skills.update((state) => {
        const knownIds = new Set(state.map((item) => item.id))
        const next = [...state]

        for (const item of items ?? []) {
          if (!item.id || knownIds.has(item.id)) {
            continue
          }

          knownIds.add(item.id)
          next.push(item)
        }

        return next
      })
      this.total.set(total ?? this.total())
    } catch (error) {
      if (version === this.#queryVersion) {
        this.#toastr.error(getErrorMessage(error))
      }
    } finally {
      if (version === this.#queryVersion) {
        this.loadingMore.set(false)
      }
    }
  }

  onIntersection() {
    void this.loadMore()
  }

  selectRepository(repositoryId: string) {
    this.selectedRepositoryId.set(repositoryId)
  }

  selectRole(value: string | number | Array<string | number> | null) {
    this.selectedRole.set(normalizeSingleSelectValue(value) ?? 'all')
  }

  selectAppType(value: string | number | Array<string | number> | null) {
    this.selectedAppType.set(normalizeSingleSelectValue(value) ?? 'all')
  }

  selectHot(value: string | number | Array<string | number> | null) {
    this.selectedHot.set(normalizeSingleSelectValue(value) ?? 'all')
  }

  openSkillDetail(item: ISkillRepositoryIndex, featured: ISkillMarketFeaturedSkill | null = null) {
    const dialogRef = this.#dialog.open(ExploreSkillDetailDialogComponent, {
      data: {
        item,
        featured,
        defaultWorkspaceName: this.workspace()?.name ?? null
      }
    })

    dialogRef.closed.subscribe((action) => {
      if (action === 'install') {
        void this.install(item)
      }
    })
  }

  async install(item: ISkillRepositoryIndex) {
    if (this.installingSkillId()) {
      return
    }

    if (this.workspace()?.id) {
      await this.installToWorkspace(this.workspace()!.id, item)
      return
    }

    this.#dialog.open(ExploreSkillInstallComponent, {
      data: item
    })
  }

  async installToWorkspace(workspaceId: string, item: ISkillRepositoryIndex) {
    if (!workspaceId || !item.id) {
      return
    }

    this.installingSkillId.set(item.id)
    try {
      await firstValueFrom(this.#skillPackageService.installPackage(workspaceId, item.id))
      this.#toastr.success(
        this.#translate.instant('PAC.Explore.SkillInstallSuccess', {
          Default: 'Skill installed successfully'
        })
      )
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    } finally {
      this.installingSkillId.set(null)
    }
  }

  installedSkillTags(item: ISkillPackage) {
    return [...new Set([...(item.metadata?.tags ?? []), ...(item.skillIndex?.tags ?? [])])].slice(0, 4)
  }

  displayInstalledSkillName(item: ISkillPackage): string {
    return readI18nText(item.metadata?.displayName) || item.name || item.metadata?.name || item.skillIndex?.name || '-'
  }

  installedSkillSummary(item: ISkillPackage): string {
    return (
      readI18nText(item.metadata?.summary) ||
      readI18nText(item.metadata?.description) ||
      item.skillIndex?.description ||
      this.#translate.instant('PAC.Explore.SkillDescriptionFallback', {
        Default: 'This skill does not include additional details yet.'
      })
    )
  }

  installedSkillRepositoryLabel(item: ISkillPackage): string {
    return (
      item.skillIndex?.repository?.name ||
      this.#translate.instant('PAC.Explore.LocalSkill', {
        Default: 'Local Skill'
      })
    )
  }

  installedSkillProviderLabel(item: ISkillPackage): string {
    return (
      item.skillIndex?.repository?.provider ||
      this.#translate.instant('PAC.Explore.LocalProvider', {
        Default: 'Local'
      })
    )
  }

  installedSkillPublisherLabel(item: ISkillPackage): string {
    return (
      item.skillIndex?.publisher?.displayName ||
      item.skillIndex?.publisher?.name ||
      item.skillIndex?.publisher?.handle ||
      item.metadata?.author?.name ||
      this.#translate.instant('PAC.Explore.LocalAuthor', {
        Default: 'Uploaded Locally'
      })
    )
  }

  openInstalledSkill(item: ISkillPackage) {
    if (item.skillIndex) {
      this.openSkillDetail(item.skillIndex)
      return
    }

    this.openWorkspaceSkills()
  }

  onInstalledSkillKeydown(event: KeyboardEvent, item: ISkillPackage) {
    if (event.key !== 'Enter' && event.key !== ' ') {
      return
    }

    event.preventDefault()
    this.openInstalledSkill(item)
  }

  openWorkspaceSkills(event?: Event) {
    event?.stopPropagation()

    const workspaceId = this.workspace()?.id
    if (!workspaceId) {
      return
    }

    this.#router.navigate(['/xpert/w', workspaceId, 'skills'])
  }

  isLocalSkill(item: ISkillPackage) {
    return !item.skillIndex
  }

  openShareDialog(item: ISkillPackage, event?: Event) {
    event?.stopPropagation()

    const workspaceId = this.workspace()?.id
    if (!workspaceId || !item.id || !this.isLocalSkill(item)) {
      return
    }

    this.#dialog
      .open<ISkillPackage | null>(ExploreSkillShareDialogComponent, {
        data: {
          skill: item,
          workspaceId
        }
      })
      .closed.subscribe((result) => {
        if (result) {
          void this.loadInstalledSkills(workspaceId)
        }
      })
  }
}

function normalizeSingleSelectValue(value: string | number | Array<string | number> | null): string | null {
  const normalized = Array.isArray(value) ? value[0] : value
  if (typeof normalized === 'number') {
    return `${normalized}`
  }
  return typeof normalized === 'string' && normalized ? normalized : null
}

function readI18nText(
  value?: string | { value?: string; zh_Hans?: string; en_US?: string; en?: string } | null
): string {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  return value.value || value.zh_Hans || value.en_US || value.en || ''
}
