import { Dialog } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
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
import { ActivatedRoute, Router } from '@angular/router'
import {
  getErrorMessage,
  injectToastr,
  IXpertMarketplaceItem,
  IXpertWorkspace,
  PluginApplicationCatalogItem,
  PluginApplicationService,
  PluginMarketplaceCategory,
  resolveI18nText,
  TXpertMarketplaceBusinessCategory,
  TXpertMarketplaceTechnicalCategory,
  TXpertTemplate,
  XpertMarketplaceBusinessCategories,
  XpertMarketplaceService,
  XpertTemplateService,
  XpertTypeEnum
} from '@cloud/app/@core'
import { EmojiAvatarComponent, IconComponent } from '@cloud/app/@shared/avatar'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { linkedModel, ZardButtonComponent, ZardIconComponent } from '@xpert-ai/headless-ui'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { firstValueFrom } from 'rxjs'
import { createAgentTemplateWizardData } from '../agents/agent-template-wizard'
import { type BlankXpertWizardResult, XpertNewBlankComponent } from '../../xpert/xpert'
import { AgentSquareAccessRequestDialogComponent } from './access-request-dialog.component'
import { AgentSquareReviewRequestsDialogComponent } from './review-requests-dialog.component'

export type AgentSquareCatalog = 'experts' | 'applications' | 'templates'
type ExpertSort = 'match' | 'updated'
type CatalogSort = 'comprehensive' | 'name'
type ApplicationStatus = PluginApplicationCatalogItem['status']['status']
type ApplicationScope = PluginApplicationCatalogItem['application']['scope']
type TemplateSource = 'builtin' | 'plugin'

const DEFAULT_CATALOG: AgentSquareCatalog = 'experts'
const APPLICATION_STATUSES: ApplicationStatus[] = ['ready', 'not_installed', 'initializing', 'degraded', 'failed']
const APPLICATION_SCOPES: ApplicationScope[] = ['organization', 'tenant', 'personal']
const TEMPLATE_SOURCES: TemplateSource[] = ['builtin', 'plugin']

@Component({
  standalone: true,
  selector: 'xp-explore-agent-square',
  imports: [CommonModule, TranslateModule, EmojiAvatarComponent, IconComponent, ZardButtonComponent, ZardIconComponent],
  templateUrl: './agent-square.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ExploreAgentSquareComponent {
  readonly search = input('')
  readonly workspace = input<IXpertWorkspace | null>(null)

  readonly #marketplaceService = inject(XpertMarketplaceService)
  readonly #applicationService = inject(PluginApplicationService)
  readonly #templateService = inject(XpertTemplateService)
  readonly #dialog = inject(Dialog)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #queryCatalog = injectQueryParams<string>('catalog')
  readonly #toastr = injectToastr()
  readonly #destroyRef = inject(DestroyRef)
  readonly #translate = inject(TranslateService)

  readonly catalog = linkedModel<AgentSquareCatalog>({
    initialValue: DEFAULT_CATALOG,
    compute: () => normalizeAgentSquareCatalog(this.#queryCatalog()),
    update: (catalog) => {
      void this.#router.navigate([], {
        relativeTo: this.#route,
        queryParams: { catalog: catalog === DEFAULT_CATALOG ? null : catalog },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
    }
  })

  readonly businessCategories = XpertMarketplaceBusinessCategories
  readonly expertSortOptions: ExpertSort[] = ['match', 'updated']
  readonly catalogSortOptions: CatalogSort[] = ['comprehensive', 'name']
  readonly applicationStatusOptions = APPLICATION_STATUSES
  readonly applicationScopeOptions = APPLICATION_SCOPES
  readonly templateSourceOptions = TEMPLATE_SOURCES
  readonly templateTypeOptions = [XpertTypeEnum.Agent, XpertTypeEnum.Copilot]

  readonly selectedBusinessCategories = signal<TXpertMarketplaceBusinessCategory[]>([])
  readonly expertSort = signal<ExpertSort>('match')

  readonly experts = signal<IXpertMarketplaceItem[]>([])
  readonly featuredExperts = signal<IXpertMarketplaceItem[]>([])
  readonly expertTotal = signal(0)
  readonly reviewableCount = signal(0)
  readonly loadingExperts = signal(false)
  readonly expertLoadError = signal<string | null>(null)
  readonly loadingFeatured = signal(false)
  readonly featuredIndex = signal(0)

  readonly applications = signal<PluginApplicationCatalogItem[]>([])
  readonly loadingApplications = signal(false)
  readonly applicationLoadError = signal<string | null>(null)
  readonly selectedApplicationCategories = signal<PluginMarketplaceCategory[]>([])
  readonly selectedApplicationTags = signal<string[]>([])
  readonly selectedApplicationStatuses = signal<ApplicationStatus[]>([])
  readonly selectedApplicationScopes = signal<ApplicationScope[]>([])
  readonly applicationSort = signal<CatalogSort>('comprehensive')

  readonly templates = signal<TXpertTemplate[]>([])
  readonly loadingTemplates = signal(false)
  readonly templateLoadError = signal<string | null>(null)
  readonly selectedTemplateCategories = signal<string[]>([])
  readonly selectedTemplateSources = signal<TemplateSource[]>([])
  readonly selectedTemplateTypes = signal<XpertTypeEnum[]>([])
  readonly templateSort = signal<CatalogSort>('comprehensive')

  readonly activeExpertFilterCount = computed(() => this.selectedBusinessCategories().length)
  readonly activeApplicationFilterCount = computed(
    () =>
      this.selectedApplicationCategories().length +
      this.selectedApplicationTags().length +
      this.selectedApplicationStatuses().length +
      this.selectedApplicationScopes().length
  )
  readonly activeTemplateFilterCount = computed(
    () =>
      this.selectedTemplateCategories().length +
      this.selectedTemplateSources().length +
      this.selectedTemplateTypes().length
  )

  readonly featuredItem = computed(() => {
    const items = this.featuredExperts()
    return items.length ? items[this.featuredIndex() % items.length] : null
  })
  readonly featuredApplication = computed(() => {
    const featured = this.featuredItem()
    if (!featured) {
      return null
    }
    const applications = this.applications()
    const directMatch = applications.find(
      (item) =>
        item.status.xpertId === featured.xpert.id ||
        (!!item.status.assistantSlug && item.status.assistantSlug === featured.xpert.slug)
    )
    if (directMatch) {
      return directMatch
    }

    const expertTitle = this.expertTitle(featured).trim().toLocaleLowerCase()
    if (!expertTitle) {
      return null
    }
    const titleMatches = applications.filter(
      (item) => this.applicationTitle(item).trim().toLocaleLowerCase() === expertTitle
    )
    return titleMatches.length === 1 ? titleMatches[0] : null
  })
  readonly featuredApplicationPreview = computed(() => {
    const application = this.featuredApplication()
    const screenshot = application ? this.applicationScreenshots(application)[0] : null
    return application && screenshot ? { application, screenshot } : null
  })

  readonly applicationCategories = computed(() =>
    Array.from(
      new Set(
        this.applications()
          .map((item) => item.marketplace.category)
          .filter((category): category is PluginMarketplaceCategory => !!category)
      )
    ).sort()
  )
  readonly applicationTags = computed(() =>
    Array.from(new Set(this.applications().flatMap((item) => item.marketplace.tags))).sort((left, right) =>
      left.localeCompare(right)
    )
  )
  readonly filteredApplications = computed(() => {
    const search = this.search().trim().toLowerCase()
    const sharedCategories = new Set<string>(this.selectedBusinessCategories())
    const categories = this.selectedApplicationCategories()
    const tags = this.selectedApplicationTags()
    const statuses = this.selectedApplicationStatuses()
    const scopes = this.selectedApplicationScopes()
    const items = this.applications().filter((item) => {
      if (sharedCategories.size && (!item.marketplace.category || !sharedCategories.has(item.marketplace.category))) {
        return false
      }
      if (categories.length && (!item.marketplace.category || !categories.includes(item.marketplace.category))) {
        return false
      }
      if (tags.length && !tags.some((tag) => item.marketplace.tags.includes(tag))) {
        return false
      }
      if (statuses.length && !statuses.includes(item.status.status)) {
        return false
      }
      if (scopes.length && !scopes.includes(item.application.scope)) {
        return false
      }
      return !search || this.applicationSearchText(item).includes(search)
    })

    return [...items].sort((left, right) => {
      if (this.expertSort() === 'updated') {
        return (
          this.catalogUpdatedAt(right.marketplace.updatedAt) - this.catalogUpdatedAt(left.marketplace.updatedAt) ||
          this.applicationTitle(left).localeCompare(this.applicationTitle(right))
        )
      }
      if (this.applicationSort() === 'name') {
        return this.applicationTitle(left).localeCompare(this.applicationTitle(right))
      }
      return (
        Number(right.marketplace.featured === true) - Number(left.marketplace.featured === true) ||
        this.applicationTitle(left).localeCompare(this.applicationTitle(right))
      )
    })
  })

  readonly assistantTemplates = computed(() =>
    this.templates().filter(
      (template) =>
        !template.application && (template.type === XpertTypeEnum.Agent || template.type === XpertTypeEnum.Copilot)
    )
  )
  readonly templateCategories = computed(() =>
    Array.from(
      new Set(
        this.assistantTemplates()
          .map((template) => template.category)
          .filter(Boolean)
      )
    ).sort()
  )
  readonly filteredTemplates = computed(() => {
    const search = this.search().trim().toLowerCase()
    const sharedCategories = new Set<string>(this.selectedBusinessCategories())
    const categories = this.selectedTemplateCategories()
    const sources = this.selectedTemplateSources()
    const types = this.selectedTemplateTypes()
    const items = this.assistantTemplates().filter((template) => {
      if (sharedCategories.size && !sharedCategories.has(template.category)) {
        return false
      }
      if (categories.length && !categories.includes(template.category)) {
        return false
      }
      if (sources.length && !sources.includes(this.templateSource(template))) {
        return false
      }
      if (types.length && !types.includes(template.type as XpertTypeEnum)) {
        return false
      }
      return !search || this.templateSearchText(template).includes(search)
    })

    return [...items].sort((left, right) => {
      if (this.expertSort() === 'updated') {
        return (
          (right.order ?? Number.MIN_SAFE_INTEGER) - (left.order ?? Number.MIN_SAFE_INTEGER) ||
          this.templateTitle(left).localeCompare(this.templateTitle(right))
        )
      }
      if (this.templateSort() === 'name') {
        return this.templateTitle(left).localeCompare(this.templateTitle(right))
      }
      return (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER)
    })
  })

  #expertQueryVersion = 0
  #featuredLoaded = false
  #applicationsLoaded = false
  #templatesLoaded = false
  #carouselTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    void this.loadFeaturedExperts()
    void this.loadApplications(this.catalog() !== 'applications')

    effect(() => {
      const catalog = this.catalog()
      if (catalog === 'experts') {
        const query = {
          search: this.search(),
          businessCategories: this.selectedBusinessCategories(),
          sort: this.expertSort(),
          take: 60
        }
        void this.loadExperts(query)
      } else if (catalog === 'applications') {
        void this.loadApplications()
      } else {
        void this.loadTemplates()
      }
    })

    this.#destroyRef.onDestroy(() => this.pauseHeroCarousel())
  }

  setCatalog(catalog: AgentSquareCatalog) {
    this.catalog.set(catalog)
  }

  async loadExperts(query = this.currentExpertQuery()) {
    const version = ++this.#expertQueryVersion
    this.loadingExperts.set(true)
    this.expertLoadError.set(null)
    try {
      const result = await firstValueFrom(this.#marketplaceService.findMarketplace(query))
      if (version !== this.#expertQueryVersion) {
        return
      }
      this.experts.set(result.items ?? [])
      this.expertTotal.set(result.total ?? 0)
      this.reviewableCount.set(result.reviewableCount ?? 0)
    } catch (error) {
      if (version === this.#expertQueryVersion) {
        this.experts.set([])
        this.expertTotal.set(0)
        this.reviewableCount.set(0)
        const message = getErrorMessage(error)
        this.expertLoadError.set(message)
        this.#toastr.error(message)
      }
    } finally {
      if (version === this.#expertQueryVersion) {
        this.loadingExperts.set(false)
      }
    }
  }

  async loadFeaturedExperts(force = false) {
    if ((this.#featuredLoaded && !force) || this.loadingFeatured()) {
      return
    }
    this.#featuredLoaded = true
    this.loadingFeatured.set(true)
    try {
      const result = await firstValueFrom(this.#marketplaceService.findMarketplace({ sort: 'match', skip: 0, take: 4 }))
      this.featuredExperts.set(result.items ?? [])
      if (this.catalog() !== 'experts') {
        this.expertTotal.set(result.total ?? 0)
        this.reviewableCount.set(result.reviewableCount ?? 0)
      }
      this.featuredIndex.set(0)
      this.restartHeroCarousel()
    } catch {
      this.featuredExperts.set([])
      this.pauseHeroCarousel()
    } finally {
      this.loadingFeatured.set(false)
    }
  }

  async loadApplications(silent = false) {
    if (this.#applicationsLoaded) {
      return
    }
    this.#applicationsLoaded = true
    this.loadingApplications.set(true)
    this.applicationLoadError.set(null)
    try {
      this.applications.set(await firstValueFrom(this.#applicationService.getCatalog()))
    } catch (error) {
      this.#applicationsLoaded = false
      this.applications.set([])
      const message = getErrorMessage(error)
      this.applicationLoadError.set(message)
      if (!silent) {
        this.#toastr.error(message)
      }
    } finally {
      this.loadingApplications.set(false)
    }
  }

  async loadTemplates() {
    if (this.#templatesLoaded) {
      return
    }
    this.#templatesLoaded = true
    this.loadingTemplates.set(true)
    this.templateLoadError.set(null)
    try {
      const result = await firstValueFrom(this.#templateService.getAll())
      this.templates.set(result.recommendedApps ?? [])
    } catch (error) {
      this.#templatesLoaded = false
      this.templates.set([])
      const message = getErrorMessage(error)
      this.templateLoadError.set(message)
      this.#toastr.error(message)
    } finally {
      this.loadingTemplates.set(false)
    }
  }

  setExpertSort(sort: ExpertSort) {
    this.expertSort.set(sort)
  }

  setApplicationSort(sort: CatalogSort) {
    this.applicationSort.set(sort)
  }

  setTemplateSort(sort: CatalogSort) {
    this.templateSort.set(sort)
  }

  resetExpertFilters() {
    this.selectedBusinessCategories.set([])
  }

  resetApplicationFilters() {
    this.selectedApplicationCategories.set([])
    this.selectedApplicationTags.set([])
    this.selectedApplicationStatuses.set([])
    this.selectedApplicationScopes.set([])
  }

  resetTemplateFilters() {
    this.selectedTemplateCategories.set([])
    this.selectedTemplateSources.set([])
    this.selectedTemplateTypes.set([])
  }

  toggleBusinessCategory(category: TXpertMarketplaceBusinessCategory) {
    this.selectedBusinessCategories.update((selected) => (selected[0] === category ? [] : [category]))
  }

  toggleApplicationCategory(category: PluginMarketplaceCategory) {
    this.toggle(this.selectedApplicationCategories, category)
  }

  toggleApplicationTag(tag: string) {
    this.toggle(this.selectedApplicationTags, tag)
  }

  toggleApplicationStatus(status: ApplicationStatus) {
    this.toggle(this.selectedApplicationStatuses, status)
  }

  toggleApplicationScope(scope: ApplicationScope) {
    this.toggle(this.selectedApplicationScopes, scope)
  }

  toggleTemplateCategory(category: string) {
    this.toggle(this.selectedTemplateCategories, category)
  }

  toggleTemplateSource(source: TemplateSource) {
    this.toggle(this.selectedTemplateSources, source)
  }

  toggleTemplateType(type: XpertTypeEnum) {
    this.toggle(this.selectedTemplateTypes, type)
  }

  async handleExpertAction(item: IXpertMarketplaceItem, event?: Event) {
    event?.stopPropagation()
    if (this.canUseExpert(item)) {
      void this.#router.navigate(['/chat/x', item.xpert.slug, 'c'])
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
      await firstValueFrom(this.#marketplaceService.requestAccess(item.xpert.id, { reason }))
      await Promise.all([this.loadExperts(), this.loadFeaturedExperts(true)])
    } catch (error) {
      this.#toastr.error(getErrorMessage(error))
    }
  }

  async openReviewDialog() {
    const changed = await firstValueFrom(
      this.#dialog.open<boolean>(AgentSquareReviewRequestsDialogComponent, { minWidth: 320 }).closed
    )
    if (changed) {
      await Promise.all([this.loadExperts(), this.loadFeaturedExperts(true)])
    }
  }

  canUseExpert(item: IXpertMarketplaceItem) {
    return ['owned', 'accessible', 'approved'].includes(item.accessStatus)
  }

  expertActionLabel(item: IXpertMarketplaceItem) {
    if (this.canUseExpert(item)) {
      return this.#translate.instant('XP.Explore.AgentSquare.UseNow', { Default: 'Use now' })
    }
    if (item.accessStatus === 'requested') {
      return this.#translate.instant('XP.Explore.AgentSquare.Pending', { Default: 'Pending approval' })
    }
    return this.#translate.instant('XP.Explore.AgentSquare.RequestAccess', { Default: 'Request access' })
  }

  expertAccessLabel(item: IXpertMarketplaceItem) {
    if (this.canUseExpert(item)) {
      return this.#translate.instant('XP.Explore.AgentSquare.Access.Available', { Default: 'Available' })
    }
    if (item.accessStatus === 'requested') {
      return this.#translate.instant('XP.Explore.AgentSquare.Access.Pending', { Default: 'Pending' })
    }
    if (item.accessStatus === 'rejected') {
      return this.#translate.instant('XP.Explore.AgentSquare.Access.Rejected', { Default: 'Request rejected' })
    }
    return this.#translate.instant('XP.Explore.AgentSquare.Access.Protected', { Default: 'Access required' })
  }

  expertStatusClasses(item: IXpertMarketplaceItem) {
    if (this.canUseExpert(item)) {
      return 'bg-state-success-hover/15 text-text-success'
    }
    if (item.accessStatus === 'requested') {
      return 'bg-state-warning-hover/15 text-text-warning'
    }
    return 'bg-muted text-muted-foreground'
  }

  expertTitle(item: IXpertMarketplaceItem | null) {
    return item?.xpert.title || item?.xpert.titleCN || item?.xpert.name || ''
  }

  expertSummary(item: IXpertMarketplaceItem | null) {
    return this.localizedCatalogText(item?.marketplace.summary) || this.localizedCatalogText(item?.xpert.description)
  }

  expertCreator(item: IXpertMarketplaceItem) {
    const creator = item.xpert.createdBy
    const fullName = [creator?.firstName, creator?.lastName].filter(Boolean).join(' ')
    return (
      fullName ||
      creator?.username ||
      creator?.email ||
      this.#translate.instant('XP.Explore.AgentSquare.UnknownCreator', { Default: 'Organization expert' })
    )
  }

  expertTags(item: IXpertMarketplaceItem) {
    return [
      ...(item.marketplace.capabilityTags ?? []),
      ...(item.marketplace.technical?.categories ?? []).map((category) =>
        this.#translate.instant(this.technicalLabelKey(category))
      )
    ]
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

  openApplicationDetails(item: PluginApplicationCatalogItem, setup = false) {
    void this.#router.navigate(['/explore/apps', item.application.appName], {
      queryParams: {
        plugin: item.application.pluginName,
        ...(setup ? { setup: 1 } : {})
      }
    })
  }

  handleApplicationAction(item: PluginApplicationCatalogItem, event?: Event) {
    event?.stopPropagation()
    if (item.status.status === 'ready' && item.status.assistantSlug) {
      void this.#router.navigate(['/chat/x', item.status.assistantSlug, 'c'])
      return
    }
    const canSetup =
      item.status.initializationAccess === 'allowed' &&
      ['not_installed', 'failed', 'degraded'].includes(item.status.status)
    this.openApplicationDetails(item, canSetup)
  }

  applicationActionDisabled(item: PluginApplicationCatalogItem) {
    return item.status.status === 'initializing'
  }

  applicationActionLabel(item: PluginApplicationCatalogItem) {
    if (item.status.status !== 'ready') {
      if (item.status.initializationAccess === 'role_required') {
        return this.#translate.instant('XP.Explore.Application.Action.ContactAdministrator', {
          Default: 'Contact administrator'
        })
      }
      if (item.status.initializationAccess === 'organization_required') {
        return this.#translate.instant('XP.Explore.Application.Action.SwitchOrganization', {
          Default: 'Switch organization'
        })
      }
      if (item.status.initializationAccess === 'unsupported') {
        return this.#translate.instant('XP.Explore.Application.Action.NotSupported', { Default: 'Not supported yet' })
      }
    }
    switch (item.status.status) {
      case 'ready':
        return this.#translate.instant('XP.Explore.Application.Action.Open', { Default: 'Open application' })
      case 'initializing':
        return this.#translate.instant('XP.Explore.Application.Action.Initializing', { Default: 'Initializing…' })
      case 'degraded':
      case 'failed':
        return this.#translate.instant('XP.Explore.Application.Action.Repair', { Default: 'Repair application' })
      default:
        return this.#translate.instant('XP.Explore.Application.Action.ApplyToOrganization', {
          Default: 'Apply to current organization'
        })
    }
  }

  applicationTitle(item: PluginApplicationCatalogItem) {
    return this.localizedCatalogText(item.application.displayName) || item.application.appName
  }

  applicationSummary(item: PluginApplicationCatalogItem) {
    return (
      this.localizedCatalogText(item.application.config.presentation?.tagline) ||
      this.localizedCatalogText(item.application.description)
    )
  }

  applicationScreenshots(item: PluginApplicationCatalogItem) {
    return (item.application.config.presentation?.screenshots ?? []).filter(
      (screenshot): screenshot is string => typeof screenshot === 'string' && !!screenshot.trim()
    )
  }

  applicationScreenshotAlt(item: PluginApplicationCatalogItem) {
    return this.#translate.instant('XP.Explore.Application.ScreenshotAlt', {
      Default: 'Screenshot of {{app}}',
      app: this.applicationTitle(item)
    })
  }

  applicationDeveloper(item: PluginApplicationCatalogItem) {
    return item.application.config.presentation?.developer || item.application.pluginName
  }

  applicationSearchText(item: PluginApplicationCatalogItem) {
    return [
      this.applicationTitle(item),
      this.applicationSummary(item),
      this.applicationDeveloper(item),
      item.marketplace.category,
      item.marketplace.subcategory,
      ...item.marketplace.tags
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  applicationStatusLabelKey(status: ApplicationStatus) {
    const keys: Record<ApplicationStatus, string> = {
      ready: 'Ready',
      not_installed: 'NotInstalled',
      initializing: 'Initializing',
      degraded: 'Degraded',
      failed: 'Failed'
    }
    return `XP.Explore.Application.Status.${keys[status]}`
  }

  applicationScopeLabelKey(scope: ApplicationScope) {
    const keys: Record<ApplicationScope, string> = {
      tenant: 'Tenant',
      organization: 'Organization',
      personal: 'Personal'
    }
    return `XP.Explore.Application.Scope.${keys[scope]}`
  }

  templateTitle(template: TXpertTemplate) {
    return this.localizedCatalogText(template.title) || this.localizedCatalogText(template.name)
  }

  templateSummary(template: TXpertTemplate) {
    return this.localizedCatalogText(template.description)
  }

  templateSource(template: TXpertTemplate): TemplateSource {
    return template.source === 'plugin' ? 'plugin' : 'builtin'
  }

  templateProvider(template: TXpertTemplate) {
    if (this.templateSource(template) === 'plugin') {
      return (
        template.pluginDisplayName ||
        template.pluginName ||
        this.#translate.instant('XP.Explore.AgentSquare.TemplateSource.plugin', { Default: 'Plugin provided' })
      )
    }
    return this.#translate.instant('XP.Explore.AgentSquare.TemplateSource.builtin', { Default: 'Built in' })
  }

  templateSearchText(template: TXpertTemplate) {
    return [
      template.title,
      template.name,
      template.description,
      template.category,
      template.pluginName,
      template.pluginDisplayName
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
  }

  openTemplate(template: TXpertTemplate, event?: Event) {
    event?.stopPropagation()
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

  businessLabelKey(category: TXpertMarketplaceBusinessCategory | PluginMarketplaceCategory) {
    return `XP.Plugin.MarketplaceCategory_${category}`
  }

  technicalLabelKey(category: TXpertMarketplaceTechnicalCategory) {
    return `XP.Explore.AgentSquare.Technical.${category}`
  }

  private currentExpertQuery() {
    return {
      search: this.search(),
      businessCategories: this.selectedBusinessCategories(),
      sort: this.expertSort(),
      take: 60
    }
  }

  private catalogUpdatedAt(value?: string) {
    const timestamp = value ? Date.parse(value) : Number.NaN
    return Number.isNaN(timestamp) ? 0 : timestamp
  }

  private updateFeaturedIndex(index: number) {
    const itemCount = this.featuredExperts().length
    this.featuredIndex.set(itemCount ? (index + itemCount) % itemCount : 0)
  }

  private restartHeroCarousel() {
    this.pauseHeroCarousel()
    this.startHeroCarousel()
  }

  private startHeroCarousel() {
    if (
      this.#carouselTimer !== null ||
      this.featuredExperts().length < 2 ||
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ) {
      return
    }
    this.#carouselTimer = setInterval(() => this.updateFeaturedIndex(this.featuredIndex() + 1), 6000)
  }

  private toggle<T>(signalValue: WritableSignal<T[]>, value: T) {
    signalValue.update((items) => (items.includes(value) ? items.filter((item) => item !== value) : [...items, value]))
  }

  private localizedCatalogText(value: unknown): string {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const parsed: unknown = JSON.parse(trimmed)
          return resolveI18nText(parsed, this.#translate.currentLang) ?? trimmed
        } catch {
          return trimmed
        }
      }
    }
    return resolveI18nText(value, this.#translate.currentLang) ?? ''
  }
}

export function normalizeAgentSquareCatalog(value: string | null | undefined): AgentSquareCatalog {
  if (value === 'applications' || value === 'apps') {
    return 'applications'
  }
  if (value === 'templates' || value === 'template') {
    return 'templates'
  }
  return DEFAULT_CATALOG
}
